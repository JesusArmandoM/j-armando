import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { and, count, eq, isNotNull, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCatalogRowCounts, seedCatalog } from "../seed.ts";
import {
  category,
  product,
  productImage,
  shippingMethod,
  sizeChart,
  variant,
} from "../schema/index.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Spec: bootstrap-database-schema, acceptance scenarios 4 and 5.

const VALID_SIZES = new Set(["XS", "S", "M", "L", "XL"]);

describe("catalog seed", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("scenario 4: populates categories, products and variants", async () => {
    const counts = await readCatalogRowCounts(testDb.db);
    expect(counts.categories).toBe(6);
    expect(counts.products).toBe(9);
    expect(counts.variants).toBeGreaterThanOrEqual(24);
    expect(counts.sizeCharts).toBe(30);
    expect(counts.shippingMethods).toBe(2);

    // Status coverage required by catalog-product-listing.
    const statusRows = await testDb.db
      .select({ status: product.status, n: count() })
      .from(product)
      .groupBy(product.status);
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row.n]));
    expect(byStatus).toEqual({ published: 6, draft: 2, archived: 1 });

    // Every product carries size/color variants with stock and price fields.
    const products = await testDb.db.select().from(product);
    for (const row of products) {
      expect(row.basePriceCents).toBeGreaterThanOrEqual(8900);
      expect(row.basePriceCents).toBeLessThanOrEqual(34900);
      expect(row.currency).toBe("USD");
    }

    const variantCountRows = await testDb.db
      .select({ productId: variant.productId, n: count() })
      .from(variant)
      .groupBy(variant.productId);
    expect(variantCountRows).toHaveLength(9);
    for (const row of variantCountRows) {
      expect(row.n).toBeGreaterThanOrEqual(3);
    }

    const allVariants = await testDb.db.select().from(variant);
    for (const row of allVariants) {
      expect(VALID_SIZES.has(row.size)).toBe(true);
      expect(row.color.length).toBeGreaterThan(0);
      expect(row.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(row.stockQty).toBeGreaterThanOrEqual(0);
      expect(typeof row.sku).toBe("string");
    }

    // At least one published product carries a zero-stock variant
    // (out-of-stock UI coverage for product-variant-selection).
    const zeroStock = await testDb.db
      .select({ id: variant.id })
      .from(variant)
      .innerJoin(product, eq(variant.productId, product.id))
      .where(and(eq(variant.stockQty, 0), eq(product.status, "published")));
    expect(zeroStock.length).toBeGreaterThanOrEqual(1);

    // At least one variant overrides the product base price.
    const overrides = await testDb.db
      .select({ override: variant.priceOverrideCents, base: product.basePriceCents })
      .from(variant)
      .innerJoin(product, eq(variant.productId, product.id))
      .where(isNotNull(variant.priceOverrideCents));
    expect(overrides.length).toBeGreaterThanOrEqual(1);
    for (const row of overrides) {
      expect(row.override).not.toBe(row.base);
    }

    // Image coverage: every product has at least one image and at least two
    // published products have three or more (gallery for product-detail-page).
    const imageCounts = await testDb.db
      .select({ productId: productImage.productId, n: count() })
      .from(productImage)
      .groupBy(productImage.productId);
    expect(imageCounts).toHaveLength(9);
    for (const row of imageCounts) {
      expect(row.n).toBeGreaterThanOrEqual(1);
    }
    const publishedIds = new Set(
      products.filter((row) => row.status === "published").map((row) => row.id),
    );
    const publishedGalleries = imageCounts.filter(
      (row) => publishedIds.has(row.productId) && row.n >= 3,
    );
    expect(publishedGalleries.length).toBeGreaterThanOrEqual(2);

    // Every seeded image path resolves to a committed placeholder file.
    const imageRows = await testDb.db.select().from(productImage);
    for (const row of imageRows) {
      expect(row.path).toMatch(/^\/images\/products\/[\w-]+\.svg$/);
      const filePath = fileURLToPath(new URL(`../../public${row.path}`, import.meta.url));
      expect(existsSync(filePath), `missing placeholder image: ${row.path}`).toBe(true);
      expect(row.altText.length).toBeGreaterThan(0);
      expect(row.position).toBeGreaterThanOrEqual(1);
    }

    const categories = await testDb.db.select().from(category).orderBy(category.sortOrder);
    expect(categories.map((row) => row.name)).toEqual([
      "Coats",
      "Blazers",
      "Dresses",
      "Knitwear",
      "Shirts",
      "Trousers",
    ]);

    // Every category has the full XS–XL chart; garment-specific measurements
    // are present only where they apply.
    const chartRows = await testDb.db
      .select({ categorySlug: category.slug, size: sizeChart.size, measurements: sizeChart.measurements })
      .from(sizeChart)
      .innerJoin(category, eq(category.id, sizeChart.categoryId));
    expect(chartRows).toHaveLength(30);
    const chartByKey = new Map(
      chartRows.map((row) => [`${row.categorySlug}/${row.size}`, row.measurements]),
    );
    expect(chartByKey.get("coats/M")?.chest).toEqual({ min: 35, max: 36 });
    expect(chartByKey.get("coats/M")?.sleeve).toEqual({ min: 32, max: 33 });
    expect(chartByKey.get("dresses/M")?.length).toEqual({ min: 45, max: 46 });
    expect(chartByKey.get("trousers/M")?.inseam).toEqual({ min: 31, max: 32 });
    expect(chartByKey.get("trousers/M")?.chest).toBeUndefined();

    const methods = await testDb.db.select().from(shippingMethod).orderBy(shippingMethod.slug);
    expect(methods.map((row) => [row.slug, row.costCents, row.deliveryEstimate])).toEqual([
      ["express", 1500, "1–2 business days"],
      ["standard", 0, "3–5 business days"],
    ]);
  });

  it("scenario 5: re-running the seed neither duplicates rows nor overwrites edits", async () => {
    const countsBefore = await readCatalogRowCounts(testDb.db);

    // Modify seeded rows the way a human would, then re-run the seed.
    await testDb.db
      .update(product)
      .set({ name: "Edited By Hand" })
      .where(eq(product.slug, "cotton-poplin-shirt"));
    const [editedTarget] = await testDb.db
      .select({ id: variant.id })
      .from(variant)
      .innerJoin(product, eq(variant.productId, product.id))
      .where(eq(product.slug, "longline-wool-overcoat"))
      .limit(1);
    await testDb.db.update(variant).set({ stockQty: 42 }).where(eq(variant.id, editedTarget.id));

    await seedCatalog(testDb.db);

    const countsAfter = await readCatalogRowCounts(testDb.db);
    expect(countsAfter).toEqual(countsBefore);

    const [editedProduct] = await testDb.db
      .select()
      .from(product)
      .where(eq(product.slug, "cotton-poplin-shirt"));
    expect(editedProduct.name).toBe("Edited By Hand");

    const [editedVariant] = await testDb.db.select().from(variant).where(eq(variant.id, editedTarget.id));
    expect(editedVariant.stockQty).toBe(42);

    // No duplicated natural keys anywhere in the seeded catalog.
    const duplicateVariants = await testDb.db
      .select({ n: count() })
      .from(variant)
      .groupBy(variant.productId, variant.size, variant.color)
      .having(ne(count(), 1));
    expect(duplicateVariants).toEqual([]);

    const duplicateProducts = await testDb.db
      .select({ n: count() })
      .from(product)
      .groupBy(product.slug)
      .having(ne(count(), 1));
    expect(duplicateProducts).toEqual([]);

    const duplicateImages = await testDb.db
      .select({ n: count() })
      .from(productImage)
      .groupBy(productImage.productId, productImage.position)
      .having(ne(count(), 1));
    expect(duplicateImages).toEqual([]);

    const duplicateSizeCharts = await testDb.db
      .select({ n: count() })
      .from(sizeChart)
      .groupBy(sizeChart.categoryId, sizeChart.size)
      .having(ne(count(), 1));
    expect(duplicateSizeCharts).toEqual([]);

    const duplicateShippingMethods = await testDb.db
      .select({ n: count() })
      .from(shippingMethod)
      .groupBy(shippingMethod.slug)
      .having(ne(count(), 1));
    expect(duplicateShippingMethods).toEqual([]);
  });
});
