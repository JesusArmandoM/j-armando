import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDatabaseUrl } from "./env.ts";
import * as schema from "./schema/index.ts";

/** Drizzle database handle bound to this repository's schema. */
export type Db = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Db;
  pool: Pool;
}

/** Creates a Drizzle database handle over a node-postgres pool for a URL. */
export function createDb(connectionString: string): DatabaseHandle {
  const pool = new Pool({ connectionString, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: DatabaseHandle | undefined;

/** Process-wide handle over `DATABASE_URL` (used by the `db:*` scripts). */
export function getDb(): Db {
  return getHandle().db;
}

/** The process-wide pool behind {@link getDb}; close it with {@link closeDb}. */
export function getHandle(): DatabaseHandle {
  if (!shared) {
    shared = createDb(getDatabaseUrl());
  }
  return shared;
}

/** Closes the process-wide pool, if one was opened. */
export async function closeDb(): Promise<void> {
  if (shared) {
    const handle = shared;
    shared = undefined;
    await handle.pool.end();
  }
}
