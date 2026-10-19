import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  formatPriceUSD,
  getProductBySlug,
  getPublishedProductBySlug,
  listSizeChartByCategorySlug,
} from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Integration coverage for the product detail read path
// (docs/specs/product-detail-page.md scenarios 1, 2, 3 and 4).

describe("product-detail data access", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("scenario 1: returns the full detail payload for a published product", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");

    expect(product).toBeDefined();
    expect(product?.slug).toBe("longline-wool-overcoat");
    expect(product?.name).toBe("Longline Wool Overcoat");
    expect(product?.description).toBeTruthy();
    expect(product?.composition).toBeTruthy();
    expect(product?.care).toBeTruthy();
    expect(product?.basePriceCents).toBe(34900);
    expect(product?.currency).toBe("USD");
    expect(product?.categoryName).toBe("Coats");
    expect(product?.categorySlug).toBe("coats");
    // Price is formatted through the shared USD cents formatter (no floats).
    expect(formatPriceUSD(product?.basePriceCents ?? 0)).toBe("$349.00");
  });

  it("scenario 2: returns every image ordered by position ascending", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");

    expect(product?.images).toHaveLength(3);
    expect(product?.images.map((image) => image.position)).toEqual([1, 2, 3]);
    expect(product?.images[0].path).toBe("/images/products/longline-wool-overcoat-1.svg");
    expect(product?.images[0].altText).toBe("Longline Wool Overcoat in Camel, front view");
    for (const image of product?.images ?? []) {
      expect(image.path).toBeTruthy();
      expect(image.altText).toBeTruthy();
    }
  });

  it("scenario 3: returns undefined for an unknown slug", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "does-not-exist");
    expect(product).toBeUndefined();
  });

  it("scenario 4: returns undefined for draft and archived products", async () => {
    const draft = await getPublishedProductBySlug(testDb.db, "cropped-tweed-jacket");
    const archived = await getPublishedProductBySlug(testDb.db, "satin-evening-gown");

    expect(draft).toBeUndefined();
    expect(archived).toBeUndefined();
  });

  it("returns the category size chart in XS–XL order", async () => {
    const chart = await listSizeChartByCategorySlug(testDb.db, "coats");

    expect(chart.map((entry) => entry.size)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(chart.find((entry) => entry.size === "M")?.measurements).toEqual({
      chest: { min: 35, max: 36 },
      waist: { min: 28, max: 29 },
      hip: { min: 38, max: 39 },
      sleeve: { min: 32, max: 33 },
    });
    expect(await listSizeChartByCategorySlug(testDb.db, "unknown")).toEqual([]);
  });

  it("keeps getProductBySlug status-agnostic (draft still readable by slug)", async () => {
    const draft = await getProductBySlug(testDb.db, "cropped-tweed-jacket");
    expect(draft?.status).toBe("draft");
  });
});
