import { eq } from "drizzle-orm";

import type { Db } from "./client.ts";
import { category, product, productImage, variant } from "./schema/index.ts";
import type {
  Category,
  NewCategory,
  NewProduct,
  NewProductImage,
  NewVariant,
  Product,
  ProductImage,
  ProductStatus,
  Variant,
} from "./schema/index.ts";

// Thin catalog repository: insert + read through the Drizzle data-access layer
// (docs/adr/0002-drizzle-data-access-layer.md). Catalog and backoffice features
// build their queries on top of this module instead of talking to the tables.

export async function insertCategory(db: Db, values: NewCategory): Promise<Category> {
  const [row] = await db.insert(category).values(values).returning();
  return row;
}

export async function insertProduct(db: Db, values: NewProduct): Promise<Product> {
  const [row] = await db.insert(product).values(values).returning();
  return row;
}

export async function insertProductImage(db: Db, values: NewProductImage): Promise<ProductImage> {
  const [row] = await db.insert(productImage).values(values).returning();
  return row;
}

export async function insertVariant(db: Db, values: NewVariant): Promise<Variant> {
  const [row] = await db.insert(variant).values(values).returning();
  return row;
}

export async function getCategoryBySlug(db: Db, slug: string): Promise<Category | undefined> {
  const rows = await db.select().from(category).where(eq(category.slug, slug)).limit(1);
  return rows[0];
}

export async function getProductBySlug(db: Db, slug: string): Promise<Product | undefined> {
  const rows = await db.select().from(product).where(eq(product.slug, slug)).limit(1);
  return rows[0];
}

export async function listProductsByStatus(db: Db, status: ProductStatus): Promise<Product[]> {
  return db.select().from(product).where(eq(product.status, status));
}

export async function listVariantsByProductId(db: Db, productId: string): Promise<Variant[]> {
  return db.select().from(variant).where(eq(variant.productId, productId));
}

export type VariantAvailability = "available" | "out_of_stock" | "discontinued";

/**
 * Availability is derived, never stored (docs/domain-model.md):
 * discontinued beats everything; otherwise stock decides.
 */
export function deriveVariantAvailability(
  value: Pick<Variant, "discontinued" | "stockQty">,
): VariantAvailability {
  if (value.discontinued) return "discontinued";
  return value.stockQty > 0 ? "available" : "out_of_stock";
}
