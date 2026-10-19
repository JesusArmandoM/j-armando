import { and, asc, desc, eq, exists, inArray, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Db } from "./client.ts";
import { category, product, productImage, variant } from "./schema/index.ts";
import type { ProductFact } from "../lib/chat/guardrails/product-match.ts";
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
  VariantSize,
} from "./schema/index.ts";
import { variantSize } from "./schema/index.ts";

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

export interface CatalogProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  basePriceCents: number;
  currency: string;
  categoryName: string;
  categorySlug: string;
  primaryImage: {
    path: string;
    altText: string;
  } | null;
}

export interface ProductDetailImage {
  path: string;
  altText: string;
  position: number;
}

/**
 * Storefront-visible variant of a product. Discontinued variants are filtered
 * out by {@link getPublishedProductBySlug} and never reach the client.
 */
export interface ProductDetailVariant {
  id: string;
  size: VariantSize;
  color: string;
  colorHex: string;
  stockQty: number;
  /** Overrides the product base price when set, in integer cents. */
  priceOverrideCents: number | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  composition: string;
  care: string;
  basePriceCents: number;
  currency: string;
  categoryName: string;
  categorySlug: string;
  images: ProductDetailImage[];
  variants: ProductDetailVariant[];
}

/**
 * Re-exported for existing catalog consumers. The implementation is the shared
 * framework-agnostic formatter in `lib/money.ts`, so the data layer and the
 * payment mapper format money identically.
 */
export { formatPriceUSD } from "../lib/money.ts";

/** Supported catalog orderings (see app/catalog/filter-params.ts). */
export const CATALOG_SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/**
 * Filter/ordering contract of the catalog listing. Every field is optional so
 * the existing unfiltered call shape keeps working; `sort` is resolved to
 * `newest` when absent by the page's `parseCatalogSearchParams`.
 */
export interface CatalogFilters {
  category?: string;
  size?: VariantSize;
  color?: string;
  maxPrice?: number;
  sort?: CatalogSort;
}

export interface CatalogFilterOptions {
  categories: { slug: string; name: string }[];
  sizes: VariantSize[];
  colors: string[];
}

/** Ordering applied when no (or an invalid) sort is requested. */
const DEFAULT_CATALOG_SORT: CatalogSort = "newest";

/** Maps a sort key to the Drizzle ORDER BY clauses (all tie-break by name). */
function catalogOrderBy(sort: CatalogSort): SQL[] {
  switch (sort) {
    case "price-asc":
      return [asc(product.basePriceCents), asc(product.name)];
    case "price-desc":
      return [desc(product.basePriceCents), asc(product.name)];
    case "name":
      return [asc(product.name)];
    case "newest":
    default:
      return [desc(product.createdAt), asc(product.name)];
  }
}

/**
 * Returns published products with their primary image and category name,
 * optionally narrowed by category / size / color / max price and reordered.
 * Draft and archived products are strictly omitted under every combination.
 *
 * Size and color match through **independent** non-discontinued variant
 * subqueries, and out-of-stock variants still count (availability, not stock,
 * decides visibility). Price filter/order uses the product base price.
 */
export async function listPublishedCatalogProducts(
  db: Db,
  filters: CatalogFilters = {},
): Promise<CatalogProductSummary[]> {
  const conditions = [eq(product.status, "published")];

  if (filters.category) {
    conditions.push(eq(category.slug, filters.category));
  }
  if (filters.size) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(variant)
          .where(
            and(
              eq(variant.productId, product.id),
              eq(variant.size, filters.size),
              eq(variant.discontinued, false),
            ),
          ),
      ),
    );
  }
  if (filters.color) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(variant)
          .where(
            and(
              eq(variant.productId, product.id),
              eq(variant.color, filters.color),
              eq(variant.discontinued, false),
            ),
          ),
      ),
    );
  }
  if (typeof filters.maxPrice === "number") {
    conditions.push(lte(product.basePriceCents, filters.maxPrice * 100));
  }

  const products = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      categoryName: category.name,
      categorySlug: category.slug,
      categorySortOrder: category.sortOrder,
    })
    .from(product)
    .innerJoin(category, eq(category.id, product.categoryId))
    .where(and(...conditions))
    .orderBy(...catalogOrderBy(filters.sort ?? DEFAULT_CATALOG_SORT));

  if (products.length === 0) {
    return [];
  }

  const productIds = products.map((p) => p.id);
  const images = await db
    .select({
      productId: productImage.productId,
      path: productImage.path,
      altText: productImage.altText,
      position: productImage.position,
    })
    .from(productImage)
    .where(inArray(productImage.productId, productIds))
    .orderBy(asc(productImage.position));

  const primaryImageMap = new Map<string, { path: string; altText: string }>();
  for (const img of images) {
    if (!primaryImageMap.has(img.productId)) {
      primaryImageMap.set(img.productId, { path: img.path, altText: img.altText });
    }
  }

  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    basePriceCents: p.basePriceCents,
    currency: p.currency,
    categoryName: p.categoryName,
    categorySlug: p.categorySlug,
    primaryImage: primaryImageMap.get(p.id) ?? null,
  }));
}

/**
 * Facet options present in the published catalog, derived only from published,
 * non-discontinued data so no option yields an empty result set. Categories
 * follow `category.sortOrder`; sizes follow the XS→XL enum order; colors are
 * alphabetical.
 */
export async function listPublishedCatalogFilterOptions(db: Db): Promise<CatalogFilterOptions> {
  const categoryRows = await db
    .selectDistinct({
      slug: category.slug,
      name: category.name,
      sortOrder: category.sortOrder,
    })
    .from(category)
    .innerJoin(product, eq(product.categoryId, category.id))
    .where(eq(product.status, "published"))
    .orderBy(asc(category.sortOrder));

  const sizeRows = await db
    .selectDistinct({ size: variant.size })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .where(and(eq(product.status, "published"), eq(variant.discontinued, false)));

  const sizeOrder = new Map(variantSize.enumValues.map((size, index) => [size, index]));
  const sizes = sizeRows
    .map((row) => row.size)
    .sort((a, b) => (sizeOrder.get(a) ?? 0) - (sizeOrder.get(b) ?? 0));

  const colorRows = await db
    .selectDistinct({ color: variant.color })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .where(and(eq(product.status, "published"), eq(variant.discontinued, false)))
    .orderBy(asc(variant.color));

  return {
    categories: categoryRows.map((row) => ({ slug: row.slug, name: row.name })),
    sizes,
    colors: colorRows.map((row) => row.color),
  };
}

/**
 * Returns the full detail payload for a single **published** product, or
 * `undefined` when the slug does not exist or the product is draft/archived.
 * Images are returned ordered by `position` ascending. Draft and archived
 * products are strictly unreachable through this query.
 */
export async function getPublishedProductBySlug(
  db: Db,
  slug: string,
): Promise<ProductDetail | undefined> {
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      composition: product.composition,
      care: product.care,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      categoryName: category.name,
      categorySlug: category.slug,
    })
    .from(product)
    .innerJoin(category, eq(category.id, product.categoryId))
    .where(and(eq(product.slug, slug), eq(product.status, "published")))
    .limit(1);

  const found = rows[0];
  if (!found) {
    return undefined;
  }

  const images = await db
    .select({
      path: productImage.path,
      altText: productImage.altText,
      position: productImage.position,
    })
    .from(productImage)
    .where(eq(productImage.productId, found.id))
    .orderBy(asc(productImage.position));

  // Storefront variants only: discontinued rows are never exposed. Size order
  // follows the PostgreSQL enum (XS→XL); colors are alphabetical. This matches
  // the catalog filter option ordering.
  const variants = await db
    .select({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      stockQty: variant.stockQty,
      priceOverrideCents: variant.priceOverrideCents,
    })
    .from(variant)
    .where(and(eq(variant.productId, found.id), eq(variant.discontinued, false)))
    .orderBy(asc(variant.size), asc(variant.color));

  return {
    id: found.id,
    slug: found.slug,
    name: found.name,
    description: found.description,
    composition: found.composition,
    care: found.care,
    basePriceCents: found.basePriceCents,
    currency: found.currency,
    categoryName: found.categoryName,
    categorySlug: found.categorySlug,
    images,
    variants,
  };
}

/**
 * Lean published-only catalog reader used to ground chat answers. Returns
 * exactly the fields the guardrail needs (price in integer cents, USD,
 * tax-exclusive) and never exposes draft or archived products. One round trip,
 * no joins, no user input in the query.
 */
export async function listPublishedProductFacts(db: Db): Promise<ProductFact[]> {
  return db
    .select({
      slug: product.slug,
      name: product.name,
      description: product.description,
      composition: product.composition,
      care: product.care,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
    })
    .from(product)
    .where(eq(product.status, "published"))
    .orderBy(asc(product.name));
}

