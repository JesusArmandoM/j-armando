import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listPublishedProductFacts } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("chat catalog facts (published-only price grounding)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("returns exact seeded published prices in integer cents", async () => {
    const facts = await listPublishedProductFacts(testDb.db);
    const bySlug = new Map(facts.map((fact) => [fact.slug, fact]));

    expect(facts).toHaveLength(6);
    expect(bySlug.get("longline-wool-overcoat")?.basePriceCents).toBe(34900);
    expect(bySlug.get("double-breasted-linen-blazer")?.basePriceCents).toBe(24900);
    expect(bySlug.get("merino-crewneck-sweater")?.basePriceCents).toBe(12900);
    for (const fact of facts) {
      expect(Number.isInteger(fact.basePriceCents)).toBe(true);
      expect(fact.currency).toBe("USD");
    }
  });

  it("omits draft and archived products so the assistant can never disclose them", async () => {
    const slugs = (await listPublishedProductFacts(testDb.db)).map((fact) => fact.slug);

    expect(slugs).not.toContain("cropped-tweed-jacket");
    expect(slugs).not.toContain("ribbed-knit-cardigan");
    expect(slugs).not.toContain("satin-evening-gown");
    expect(slugs).toHaveLength(6);
  });

  it("carries composition, care and description for grounding in-scope answers", async () => {
    const facts = await listPublishedProductFacts(testDb.db);

    for (const fact of facts) {
      expect(fact.name.length).toBeGreaterThan(0);
      expect(fact.description.length).toBeGreaterThan(0);
      expect(fact.composition.length).toBeGreaterThan(0);
      expect(fact.care.length).toBeGreaterThan(0);
    }

    const overcoat = facts.find((fact) => fact.slug === "longline-wool-overcoat");
    expect(overcoat?.composition).toContain("70% wool");
    expect(overcoat?.care).toContain("Dry clean only");
  });
});
