import { count, inArray } from "drizzle-orm";

import { closeDb, getHandle } from "./client.ts";
import type { Db } from "./client.ts";
import { isMainModule } from "./main.ts";
import { seedCategories, seedProducts } from "./seed-data.ts";
import { category, product, productImage, variant } from "./schema/index.ts";

/**
 * Loads the demo catalog (db/seed-data.ts) into the database.
 *
 * Semantics are strictly insert-if-missing (`ON CONFLICT DO NOTHING`) on the
 * natural keys `category.slug`, `product.slug`, `variant (product_id, size,
 * color)` and `product_image (product_id, position)`, inside one transaction.
 * The seed never updates and never deletes rows: re-running it never
 * duplicates rows and never overwrites manual edits (see CONSTRAINTS.md).
 */
export async function seedCatalog(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const seedCategory of seedCategories) {
      await tx
        .insert(category)
        .values({
          slug: seedCategory.slug,
          name: seedCategory.name,
          sortOrder: seedCategory.sortOrder,
        })
        .onConflictDoNothing({ target: category.slug });
    }

    const categoryRows = await tx
      .select({ id: category.id, slug: category.slug })
      .from(category)
      .where(
        inArray(
          category.slug,
          seedCategories.map((c) => c.slug),
        ),
      );
    const categoryIds = new Map(categoryRows.map((row) => [row.slug, row.id]));

    for (const seedProduct of seedProducts) {
      const categoryId = categoryIds.get(seedProduct.categorySlug);
      if (!categoryId) {
        throw new Error(`seed category not found: ${seedProduct.categorySlug}`);
      }
      await tx
        .insert(product)
        .values({
          slug: seedProduct.slug,
          name: seedProduct.name,
          description: seedProduct.description,
          composition: seedProduct.composition,
          care: seedProduct.care,
          basePriceCents: seedProduct.basePriceCents,
          currency: "USD",
          categoryId,
          status: seedProduct.status,
        })
        .onConflictDoNothing({ target: product.slug });
    }

    const productRows = await tx
      .select({ id: product.id, slug: product.slug })
      .from(product)
      .where(
        inArray(
          product.slug,
          seedProducts.map((p) => p.slug),
        ),
      );
    const productIds = new Map(productRows.map((row) => [row.slug, row.id]));

    for (const seedProduct of seedProducts) {
      const productId = productIds.get(seedProduct.slug);
      if (!productId) {
        throw new Error(`seed product not found: ${seedProduct.slug}`);
      }

      for (const image of seedProduct.images) {
        await tx
          .insert(productImage)
          .values({
            productId,
            path: image.path,
            altText: image.altText,
            position: image.position,
          })
          .onConflictDoNothing({ target: [productImage.productId, productImage.position] });
      }

      for (const seedVariant of seedProduct.variants) {
        await tx
          .insert(variant)
          .values({
            productId,
            size: seedVariant.size,
            color: seedVariant.color,
            colorHex: seedVariant.colorHex,
            sku: seedVariant.sku,
            priceOverrideCents: seedVariant.priceOverrideCents ?? null,
            stockQty: seedVariant.stockQty,
            discontinued: false,
          })
          .onConflictDoNothing({ target: [variant.productId, variant.size, variant.color] });
      }
    }
  });
}

if (isMainModule(import.meta.url)) {
  const { db } = getHandle();
  try {
    await seedCatalog(db);
    const counts = await readCatalogRowCounts(db);
    console.log("Seed complete (insert-if-missing; existing rows are never updated or deleted).");
    console.log(`  categories: ${counts.categories}`);
    console.log(`  products:   ${counts.products}`);
    console.log(`  variants:   ${counts.variants}`);
    console.log(`  images:     ${counts.images}`);
  } finally {
    await closeDb();
  }
}

/** Row totals for the seeded catalog tables (used by the CLI transcript). */
export async function readCatalogRowCounts(db: Db): Promise<{
  categories: number;
  products: number;
  variants: number;
  images: number;
}> {
  const [categories] = await db.select({ n: count() }).from(category);
  const [products] = await db.select({ n: count() }).from(product);
  const [variants] = await db.select({ n: count() }).from(variant);
  const [images] = await db.select({ n: count() }).from(productImage);
  return {
    categories: categories.n,
    products: products.n,
    variants: variants.n,
    images: images.n,
  };
}
