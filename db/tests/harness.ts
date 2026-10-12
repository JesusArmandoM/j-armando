import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { Pool } from "pg";
import { inject } from "vitest";

import { createDb } from "../client.ts";
import type { Db } from "../client.ts";

// Per-test-file database utilities for the `db` Vitest project. Every test
// file gets its own throwaway database on the shared embedded PostgreSQL
// server started by global-setup.ts, so files can run in parallel and each
// scenario starts from the state it documents (empty, migrated, seeded).

declare module "vitest" {
  interface ProvidedContext {
    jaTestDatabaseUrl: string;
  }
}

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Connection URL of the embedded test server started by global-setup.ts. */
export function getTestServerUrl(): string {
  const url = inject("jaTestDatabaseUrl") ?? process.env.JA_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "embedded PostgreSQL test server URL is missing; db/tests/global-setup.ts did not run",
    );
  }
  return url;
}

export interface TestDatabase {
  /** Connection URL of the throwaway database. */
  url: string;
  db: Db;
  pool: Pool;
  /** Closes the pool and drops the database. */
  drop: () => Promise<void>;
}

/** Creates an empty throwaway database on the embedded test server. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = getTestServerUrl();
  const name = `ja_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const connectionString = url.toString();
  const { db, pool } = createDb(connectionString);

  return {
    url: connectionString,
    db,
    pool,
    drop: async () => {
      await pool.end();
      const cleanup = new Client({ connectionString: serverUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
      await cleanup.end();
    },
  };
}

/** Applies the committed migrations from db/migrations to the given database. */
export async function migrateDatabase(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}

export interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs one of the `db/` CLI scripts (`db/seed.ts`, `db/verify.ts`) with Node,
 * exactly as `pnpm db:seed` / `pnpm db:verify` do, against the given database.
 */
export async function runDbScript(
  scriptUrl: string | URL,
  databaseUrl: string,
): Promise<ScriptResult> {
  const scriptPath = fileURLToPath(scriptUrl);
  return await new Promise<ScriptResult>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
