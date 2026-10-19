import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createProductWithVariants,
  getAdminProductById,
  listAdminCategories,
  listAdminProducts,
} from "../admin-products.ts";
import { getPublishedProductBySlug, listPublishedCatalogProducts } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("admin product creation repository (db/admin-products.ts)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("Scenario 1: Creating a product with two variants and stock persists as draft and is listed in the backoffice", async () => {
    const categories = await listAdminCategories(testDb.db);
    expect(categories.length).toBeGreaterThanOrEqual(6);
    const coatsCategory = categories.find((c) => c.slug === "coats") ?? categories[0];

    const createResult = await createProductWithVariants(testDb.db, {
      name: "Double-Faced Cashmere Wrap Coat",
      categoryId: coatsCategory.id,
      basePriceDollars: "495.00",
      description: "Hand-finished wrap coat in double-faced Italian cashmere.",
      composition: "100% Cashmere",
      care: "Specialist dry clean only.",
      imageUrl: "/images/products/longline-wool-overcoat-1.svg",
      variants: [
        { size: "S", color: "Camel", colorHex: "#b68f66", stockQty: 12 },
        { size: "M", color: "Camel", colorHex: "#b68f66", stockQty: 8 },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) throw new Error(`Expected creation success: ${createResult.error}`);

    const created = createResult.product;
    expect(created.name).toBe("Double-Faced Cashmere Wrap Coat");
    expect(created.slug).toBe("double-faced-cashmere-wrap-coat");
    expect(created.status).toBe("draft");
    expect(created.basePriceCents).toBe(49500);
    expect(created.currency).toBe("USD");
    expect(created.categoryName).toBe(coatsCategory.name);
    expect(created.variants).toHaveLength(2);
    expect(created.totalStock).toBe(20);
    expect(created.images).toHaveLength(1);

    // Verify it is listed in the backoffice product list
    const adminList = await listAdminProducts(testDb.db);
    const inBackoffice = adminList.find((p) => p.id === created.id);
    expect(inBackoffice).toBeDefined();
    expect(inBackoffice?.status).toBe("draft");
    expect(inBackoffice?.variantCount).toBe(2);
    expect(inBackoffice?.totalStock).toBe(20);
    expect(inBackoffice?.basePriceCents).toBe(49500);

    // Verify draft product does NOT leak into the public storefront catalog
    const storefrontList = await listPublishedCatalogProducts(testDb.db);
    expect(storefrontList.some((p) => p.slug === created.slug)).toBe(false);
    const storefrontDetail = await getPublishedProductBySlug(testDb.db, created.slug);
    expect(storefrontDetail).toBeUndefined();
  });

  it("Scenario 2: Stock is stored per variant, not per product", async () => {
    const categories = await listAdminCategories(testDb.db);
    const knitwearCategory =
      categories.find((c) => c.slug === "knitwear") ?? categories[0];

    const createResult = await createProductWithVariants(testDb.db, {
      name: "Ribbed Fine Merino Turtleneck",
      categoryId: knitwearCategory.id,
      basePriceDollars: "185.00",
      description: "Close-fitting turtleneck knitted from extra-fine merino wool.",
      composition: "100% Extra-Fine Merino Wool",
      care: "Hand wash cold, dry flat.",
      variants: [
        { size: "XS", color: "Ivory", colorHex: "#f5f3ef", stockQty: 15 },
        { size: "M", color: "Obsidian", colorHex: "#121212", stockQty: 0 },
        { size: "L", color: "Obsidian", colorHex: "#121212", stockQty: 7 },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) throw new Error("Expected creation success");

    const loaded = await getAdminProductById(testDb.db, createResult.product.id);
    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error("Expected loaded product");

    expect(loaded.variants).toHaveLength(3);
    const xsIvory = loaded.variants.find(
      (v) => v.size === "XS" && v.color === "Ivory",
    );
    const mObsidian = loaded.variants.find(
      (v) => v.size === "M" && v.color === "Obsidian",
    );
    const lObsidian = loaded.variants.find(
      (v) => v.size === "L" && v.color === "Obsidian",
    );

    expect(xsIvory?.stockQty).toBe(15);
    expect(xsIvory?.stock).toBe(15);
    expect(mObsidian?.stockQty).toBe(0);
    expect(mObsidian?.stock).toBe(0);
    expect(lObsidian?.stockQty).toBe(7);
    expect(lObsidian?.stock).toBe(7);
    expect(loaded.totalStock).toBe(22);
  });

  it("Scenario 3: Invalid input is rejected with a clear message and writes no database rows", async () => {
    const beforeCount = (await listAdminProducts(testDb.db)).length;
    const categories = await listAdminCategories(testDb.db);

    // 1. Negative stock and duplicate variant
    const badVariantsResult = await createProductWithVariants(testDb.db, {
      name: "Invalid Stock Product",
      categoryId: categories[0].id,
      basePriceDollars: "200.00",
      description: "Valid description",
      composition: "100% Cotton",
      care: "Machine wash cold",
      variants: [
        { size: "S", color: "Black", stockQty: -5 },
        { size: "S", color: "Black", stockQty: 3 },
      ],
    });

    expect(badVariantsResult.ok).toBe(false);
    if (badVariantsResult.ok) throw new Error("Expected failure");
    expect(badVariantsResult.error).toBeTruthy();

    // 2. Non-existent category UUID
    const badCategoryResult = await createProductWithVariants(testDb.db, {
      name: "Orphan Category Product",
      categoryId: "00000000-0000-4000-8000-000000000000",
      basePriceDollars: "200.00",
      description: "Valid description",
      composition: "100% Cotton",
      care: "Machine wash cold",
      variants: [{ size: "M", color: "White", stockQty: 4 }],
    });

    expect(badCategoryResult.ok).toBe(false);
    if (badCategoryResult.ok) throw new Error("Expected failure");
    expect(badCategoryResult.error).toBe("Selected category does not exist.");

    const afterCount = (await listAdminProducts(testDb.db)).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("handles duplicate product names by generating unique collision-safe slugs", async () => {
    const categories = await listAdminCategories(testDb.db);
    const catId = categories[0].id;

    const first = await createProductWithVariants(testDb.db, {
      name: "Signature Silk Shirt",
      categoryId: catId,
      basePriceDollars: "220.00",
      description: "Relaxed button-down shirt in crepe de chine.",
      composition: "100% Mulberry Silk",
      care: "Dry clean only.",
      variants: [{ size: "S", color: "Ivory", stockQty: 5 }],
    });

    const second = await createProductWithVariants(testDb.db, {
      name: "Signature Silk Shirt",
      categoryId: catId,
      basePriceDollars: "220.00",
      description: "Seasonal edition.",
      composition: "100% Mulberry Silk",
      care: "Dry clean only.",
      variants: [{ size: "M", color: "Black", stockQty: 6 }],
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected both products to succeed");

    expect(first.product.slug).toBe("signature-silk-shirt");
    expect(second.product.slug).toBe("signature-silk-shirt-2");
  });
});
