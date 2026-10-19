import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Spec: bootstrap-database-schema, acceptance scenarios 1 and 2.

const CORE_TABLES = [
  "category",
  "product",
  "product_image",
  "variant",
  "size_chart",
  "cart",
  "cart_line",
  "account",
  "address",
  "shipping_method",
  "order",
  "order_line",
  "payment",
];

async function listPublicTables(testDb: TestDatabase): Promise<string[]> {
  const result = await testDb.pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return result.rows.map((row) => row.table_name);
}

async function listAppliedMigrationHashes(testDb: TestDatabase): Promise<string[]> {
  const result = await testDb.pool.query<{ hash: string }>(
    'SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id',
  );
  return result.rows.map((row) => row.hash);
}

describe("database migrations", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("scenario 1: runs against an empty database and creates the core tables", async () => {
    expect(await listPublicTables(testDb)).toEqual([]);

    await migrateDatabase(testDb.db);

    const tables = await listPublicTables(testDb);
    for (const coreTable of CORE_TABLES) {
      expect(tables).toContain(coreTable);
    }
    expect(await listAppliedMigrationHashes(testDb)).not.toEqual([]);
  });

  it("scenario 2: re-running migrations is tracked and changes nothing", async () => {
    const tablesBefore = await listPublicTables(testDb);
    const migrationsBefore = await listAppliedMigrationHashes(testDb);

    await migrateDatabase(testDb.db);

    expect(await listPublicTables(testDb)).toEqual(tablesBefore);
    expect(await listAppliedMigrationHashes(testDb)).toEqual(migrationsBefore);
  });
});
