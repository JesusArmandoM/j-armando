import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatPriceUSD, listPublishedCatalogProducts } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("catalog-product-listing data access", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("returns empty array when catalog has no products", async () => {
    const products = await listPublishedCatalogProducts(testDb.db);
    expect(products).toEqual([]);
  });

  it("scenario 1: returns only published products and omits draft and archived products", async () => {
    await seedCatalog(testDb.db);

    const products = await listPublishedCatalogProducts(testDb.db);

    // Seed has 9 products: 6 published, 2 draft (cropped-tweed-jacket, ribbed-knit-cardigan), 1 archived (satin-evening-gown)
    expect(products).toHaveLength(6);

    const slugs = products.map((p) => p.slug);
    expect(slugs).not.toContain("cropped-tweed-jacket");
    expect(slugs).not.toContain("ribbed-knit-cardigan");
    expect(slugs).not.toContain("satin-evening-gown");

    // All published products are present
    expect(slugs).toContain("longline-wool-overcoat");
    expect(slugs).toContain("double-breasted-linen-blazer");
    expect(slugs).toContain("silk-slip-midi-dress");
    expect(slugs).toContain("merino-crewneck-sweater");
    expect(slugs).toContain("cotton-poplin-shirt");
    expect(slugs).toContain("pleated-wool-trousers");

    // All returned items must have valid attributes
    for (const item of products) {
      expect(item.id).toBeTruthy();
      expect(item.slug).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.basePriceCents).toBeGreaterThan(0);
      expect(item.currency).toBe("USD");
      expect(item.categoryName).toBeTruthy();
      expect(item.primaryImage).not.toBeNull();
      expect(item.primaryImage?.path).toMatch(/^\/images\/products\/.*\.svg$/);
      expect(item.primaryImage?.altText).toBeTruthy();
    }
  });

  it("scenario 2: formats prices correctly in USD integer cents", () => {
    expect(formatPriceUSD(34900)).toBe("$349.00");
    expect(formatPriceUSD(24900)).toBe("$249.00");
    expect(formatPriceUSD(8900)).toBe("$89.00");
    expect(formatPriceUSD(12050)).toBe("$120.50");
  });
});
