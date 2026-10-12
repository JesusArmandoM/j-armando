import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";

// Ephemeral embedded PostgreSQL 17 server for tests and local verification.
// Real PostgreSQL binaries are shipped by the `embedded-postgres` package, so
// no Docker and no system PostgreSQL installation is required (CONSTRAINTS.md).
// The server lives only for the current process run and leaves nothing behind.

export interface EmbeddedPostgresHandle {
  /** Connection URL for the server's maintenance database (`postgres`). */
  url: string;
  port: number;
  /** Stops the server and removes its data directory. */
  stop: () => Promise<void>;
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

/**
 * Bootstraps and starts an embedded PostgreSQL cluster in a temporary
 * directory. Callers must call `stop()` (a test globalSetup teardown, or the
 * devdb CLI's signal handler).
 */
export async function startEmbeddedPostgres(): Promise<EmbeddedPostgresHandle> {
  const dataDir = await mkdtemp(join(tmpdir(), "ja-embedded-pg-"));
  const port = await getFreePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "password",
    port,
    persistent: false,
    onLog: () => {
      // Keep test and CLI output readable; postgres chatter goes nowhere.
    },
    onError: () => {
      // Same as onLog; failures still surface through rejected promises.
    },
  });

  await postgres.initialise();
  await postgres.start();

  return {
    url: `postgresql://postgres:password@127.0.0.1:${port}/postgres`,
    port,
    stop: async () => {
      await postgres.stop();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
