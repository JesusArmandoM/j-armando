import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deriveVariantAvailability,
  getCategoryBySlug,
  getProductBySlug,
  insertCategory,
  insertProduct,
  insertVariant,
  listVariantsByProductId,
} from "../catalog.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Spec: bootstrap-database-schema, acceptance scenario 3.

describe("data-access layer smoke", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("scenario 3: inserts rows into core tables and reads them back", async () => {
    const categoryRow = await insertCategory(testDb.db, {
      slug: "smoke-category",
      name: "Smoke Category",
      sortOrder: 1,
    });
    expect(categoryRow.id).toBeTruthy();
    expect(await getCategoryBySlug(testDb.db, "smoke-category")).toEqual(categoryRow);

    const productRow = await insertProduct(testDb.db, {
      slug: "smoke-product",
      name: "Smoke Product",
      description: "A product created by the smoke test.",
      composition: "100% cotton.",
      care: "Machine wash cold.",
      basePriceCents: 12345,
      categoryId: categoryRow.id,
    });
    const readProduct = await getProductBySlug(testDb.db, "smoke-product");
    expect(readProduct).toMatchObject({
      slug: "smoke-product",
      name: "Smoke Product",
      description: "A product created by the smoke test.",
      composition: "100% cotton.",
      care: "Machine wash cold.",
      basePriceCents: 12345,
      currency: "USD",
      status: "draft",
    });
    expect(readProduct?.createdAt).toBeInstanceOf(Date);

    const variantRow = await insertVariant(testDb.db, {
      productId: productRow.id,
      size: "M",
      color: "Navy",
      colorHex: "#22304A",
      sku: "JA-SMOKE-NVY-M",
      stockQty: 3,
    });
    const readVariants = await listVariantsByProductId(testDb.db, productRow.id);
    expect(readVariants).toHaveLength(1);
    expect(readVariants[0]).toMatchObject({
      id: variantRow.id,
      size: "M",
      color: "Navy",
      colorHex: "#22304A",
      priceOverrideCents: null,
      stockQty: 3,
      discontinued: false,
    });
  });

  it("derives variant availability from stock and the discontinued flag", () => {
    expect(deriveVariantAvailability({ stockQty: 3, discontinued: false })).toBe("available");
    expect(deriveVariantAvailability({ stockQty: 0, discontinued: false })).toBe("out_of_stock");
    expect(deriveVariantAvailability({ stockQty: 3, discontinued: true })).toBe("discontinued");
    expect(deriveVariantAvailability({ stockQty: 0, discontinued: true })).toBe("discontinued");
  });
});
