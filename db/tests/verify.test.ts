import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyCatalog } from "../verify.ts";
import { createTestDatabase, migrateDatabase, runDbScript } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Spec: bootstrap-database-schema, acceptance scenario 6. The scripts are run
// exactly as `pnpm db:seed` and `pnpm db:verify` run them (Node with native
// type stripping), so this also keeps the CLI entry points honest.

const seedScriptUrl = new URL("../seed.ts", import.meta.url);
const verifyScriptUrl = new URL("../verify.ts", import.meta.url);

describe("catalog verification", () => {
  let seededDb: TestDatabase;
  let emptyDb: TestDatabase;

  beforeAll(async () => {
    seededDb = await createTestDatabase();
    await migrateDatabase(seededDb.db);
    const seedRun = await runDbScript(seedScriptUrl, seededDb.url);
    if (seedRun.code !== 0) {
      throw new Error(`db:seed failed in test setup: ${seedRun.stderr || seedRun.stdout}`);
    }

    // Migrated but unseeded: the catalog is empty.
    emptyDb = await createTestDatabase();
    await migrateDatabase(emptyDb.db);
  });

  afterAll(async () => {
    await seededDb.drop();
    await emptyDb.drop();
  });

  it("scenario 6: db:verify exits 0 on a seeded catalog and prints the counts", async () => {
    const result = await runDbScript(verifyScriptUrl, seededDb.url);
    expect(result.stderr).not.toContain("FAILED");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("categories: 6");
    expect(result.stdout).toContain("products:   9");
    expect(result.stdout).toContain("published: 6, draft: 2, archived: 1");
    expect(result.stdout).toContain("OK: catalog is populated");
  });

  it("scenario 6: db:verify exits non-zero on an empty catalog", async () => {
    const result = await runDbScript(verifyScriptUrl, emptyDb.url);
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("FAILED: catalog is not populated");
  });

  it("verifyCatalog accepts the seeded baseline and rejects the empty catalog", async () => {
    const populated = await verifyCatalog(seededDb.db);
    expect(populated.ok).toBe(true);
    expect(populated.problems).toEqual([]);
    expect(populated.counts.productsByStatus).toEqual({
      published: 6,
      draft: 2,
      archived: 1,
    });

    const empty = await verifyCatalog(emptyDb.db);
    expect(empty.ok).toBe(false);
    expect(empty.problems.length).toBeGreaterThanOrEqual(4);
    expect(empty.counts).toMatchObject({ categories: 0, products: 0, variants: 0 });
  });
});
