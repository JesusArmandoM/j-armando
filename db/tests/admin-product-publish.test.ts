import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createProductWithVariants,
  listAdminCategories,
  listAdminProducts,
  updateProductStatus,
} from "../admin-products.ts";
import {
  getPublishedProductBySlug,
  listProductsByStatus,
  listPublishedCatalogProducts,
} from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("admin product publishing and lifecycle transitions (db/admin-products.ts)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("Scenario 1 & 3: Publishing a draft product makes it appear in storefront catalog and detail", async () => {
    const categories = await listAdminCategories(testDb.db);
    const dressesCat =
      categories.find((c) => c.slug === "dresses") ?? categories[0];

    // 1. Create a draft product
    const createResult = await createProductWithVariants(testDb.db, {
      name: "Silk Satin Midi Slip Dress",
      categoryId: dressesCat.id,
      basePriceDollars: "260.00",
      description: "Bias-cut midi slip dress crafted from fluid mulberry silk.",
      composition: "100% Silk",
      care: "Dry clean only.",
      variants: [
        { size: "S", color: "Champagne", colorHex: "#f7e7ce", stockQty: 10 },
        { size: "M", color: "Champagne", colorHex: "#f7e7ce", stockQty: 6 },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) throw new Error("Expected product creation to succeed");

    const created = createResult.product;
    expect(created.status).toBe("draft");

    // Scenario 3: Verify draft product is NOT visible in storefront catalog or detail
    const publishedBefore = await listPublishedCatalogProducts(testDb.db);
    expect(publishedBefore.some((p) => p.slug === created.slug)).toBe(false);

    const draftProducts = await listProductsByStatus(testDb.db, "draft");
    expect(draftProducts.some((p) => p.slug === created.slug)).toBe(true);

    const detailBefore = await getPublishedProductBySlug(testDb.db, created.slug);
    expect(detailBefore).toBeUndefined();

    // 2. Publish the product
    const updated = await updateProductStatus(testDb.db, created.id, "published");
    expect(updated).not.toBeNull();
    if (!updated) throw new Error("Expected update to succeed");

    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe("published");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    );

    // Scenario 1: Verify it now appears in storefront catalog and detail
    const publishedAfter = await listPublishedCatalogProducts(testDb.db);
    expect(publishedAfter.some((p) => p.slug === created.slug)).toBe(true);

    const detailAfter = await getPublishedProductBySlug(testDb.db, created.slug);
    expect(detailAfter).toBeDefined();
    expect(detailAfter?.name).toBe("Silk Satin Midi Slip Dress");
    expect(detailAfter?.basePriceCents).toBe(26000);
  });

  it("Scenario 2: Archiving a published product removes it from catalog and product detail", async () => {
    const categories = await listAdminCategories(testDb.db);
    const knitwearCat =
      categories.find((c) => c.slug === "knitwear") ?? categories[0];

    // Create and publish
    const createResult = await createProductWithVariants(testDb.db, {
      name: "Chunky Alpaca Crewneck Sweater",
      categoryId: knitwearCat.id,
      basePriceDollars: "310.00",
      description: "Warm and tactile crewneck knit in plush baby alpaca yarn.",
      composition: "70% Baby Alpaca, 30% Wool",
      care: "Hand wash cold.",
      variants: [{ size: "M", color: "Oatmeal", stockQty: 5 }],
    });

    if (!createResult.ok) throw new Error("Expected creation");
    const productId = createResult.product.id;
    const productSlug = createResult.product.slug;

    await updateProductStatus(testDb.db, productId, "published");
    expect((await getPublishedProductBySlug(testDb.db, productSlug))).toBeDefined();

    // Archive the product
    const archived = await updateProductStatus(testDb.db, productId, "archived");
    expect(archived).not.toBeNull();
    expect(archived?.status).toBe("archived");

    // Storefront queries must not find it
    const catalogProducts = await listPublishedCatalogProducts(testDb.db);
    expect(catalogProducts.some((p) => p.slug === productSlug)).toBe(false);

    const archivedProducts = await listProductsByStatus(testDb.db, "archived");
    expect(archivedProducts.some((p) => p.slug === productSlug)).toBe(true);

    const detail = await getPublishedProductBySlug(testDb.db, productSlug);
    expect(detail).toBeUndefined();

    // Backoffice product list still lists archived products
    const backofficeList = await listAdminProducts(testDb.db);
    const inBackoffice = backofficeList.find((p) => p.id === productId);
    expect(inBackoffice).toBeDefined();
    expect(inBackoffice?.status).toBe("archived");
  });

  it("Scenario 4: Moving an archived product back to published or draft updates visibility accordingly", async () => {
    const categories = await listAdminCategories(testDb.db);
    const cat = categories[0];

    const createResult = await createProductWithVariants(testDb.db, {
      name: "Tailored Wool Blend Trousers",
      categoryId: cat.id,
      basePriceDollars: "195.00",
      description: "Straight-leg pleated trousers in lightweight virgin wool.",
      composition: "98% Virgin Wool, 2% Elastane",
      care: "Dry clean only.",
      variants: [{ size: "S", color: "Navy", stockQty: 8 }],
    });

    if (!createResult.ok) throw new Error("Expected creation");
    const productId = createResult.product.id;
    const slug = createResult.product.slug;

    // Move draft -> archived
    await updateProductStatus(testDb.db, productId, "archived");
    expect(await getPublishedProductBySlug(testDb.db, slug)).toBeUndefined();

    // Move archived -> published
    const republished = await updateProductStatus(testDb.db, productId, "published");
    expect(republished?.status).toBe("published");
    expect(await getPublishedProductBySlug(testDb.db, slug)).toBeDefined();

    // Move published -> draft
    const reverted = await updateProductStatus(testDb.db, productId, "draft");
    expect(reverted?.status).toBe("draft");
    expect(await getPublishedProductBySlug(testDb.db, slug)).toBeUndefined();
  });

  it("handles non-existent or invalid product IDs safely", async () => {
    const invalidUuid = "not-a-valid-uuid";
    const nonExistent = "11111111-2222-3333-4444-555555555555";

    expect(await updateProductStatus(testDb.db, invalidUuid, "published")).toBeNull();
    expect(await updateProductStatus(testDb.db, nonExistent, "published")).toBeNull();
    // @ts-expect-error Testing invalid runtime status argument
    expect(await updateProductStatus(testDb.db, nonExistent, "deleted")).toBeNull();
  });
});
