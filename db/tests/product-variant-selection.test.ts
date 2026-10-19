import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPublishedProductBySlug, insertVariant } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Integration coverage for the storefront-visible variant payload
// (docs/specs/product-variant-selection.md scenario 1 and the price/stock data
// behind scenarios 2, 3 and 6).

describe("product variant selection data access", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("returns only non-discontinued variants ordered by size then color", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");

    expect(product?.variants.map((variant) => `${variant.size}/${variant.color}`)).toEqual([
      "S/Camel",
      "M/Camel",
      "M/Charcoal",
      "L/Camel",
      "L/Charcoal",
    ]);
    // Every storefront option carries its swatch hex and stock quantity.
    for (const variant of product?.variants ?? []) {
      expect(variant.colorHex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(Number.isInteger(variant.stockQty)).toBe(true);
    }
    // The documented zero-stock pair survives the payload (it drives the
    // disabled tile); it is not filtered out like a discontinued row.
    const camelSmall = product?.variants.find(
      (variant) => variant.size === "S" && variant.color === "Camel",
    );
    expect(camelSmall?.stockQty).toBe(0);
  });

  it("carries the price override intact and null when the base price applies", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "double-breasted-linen-blazer");

    const xlNavy = product?.variants.find(
      (variant) => variant.size === "XL" && variant.color === "Navy",
    );
    expect(xlNavy?.priceOverrideCents).toBe(22900);
    expect(xlNavy?.stockQty).toBe(7);

    const mediumIvory = product?.variants.find(
      (variant) => variant.size === "M" && variant.color === "Ivory",
    );
    expect(mediumIvory?.priceOverrideCents).toBeNull();
    expect(mediumIvory?.stockQty).toBe(12);
    expect(product?.basePriceCents).toBe(24900);
  });

  it("excludes a discontinued variant from the storefront payload", async () => {
    const product = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");
    if (!product) throw new Error("expected the seeded overcoat");

    await insertVariant(testDb.db, {
      productId: product.id,
      size: "XS",
      color: "Black",
      colorHex: "#1A1A1A",
      sku: "JA-OWO-BLK-XS",
      stockQty: 4,
      discontinued: true,
    });

    const after = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");
    expect(after?.variants.some((variant) => variant.size === "XS")).toBe(false);
    expect(after?.variants.some((variant) => variant.color === "Black")).toBe(false);
    expect(after?.variants).toHaveLength(5);
  });

  it("still returns undefined for draft/archived products and unknown slugs", async () => {
    expect(await getPublishedProductBySlug(testDb.db, "cropped-tweed-jacket")).toBeUndefined();
    expect(await getPublishedProductBySlug(testDb.db, "satin-evening-gown")).toBeUndefined();
    expect(await getPublishedProductBySlug(testDb.db, "does-not-exist")).toBeUndefined();
  });
});
