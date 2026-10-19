import { asc, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "./client.ts";
import { category, product, productImage, variant } from "./schema/index.ts";
import type { ProductStatus, VariantSize } from "./schema/index.ts";
import { validateAdminProductInput } from "../app/admin/products/product-input.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminCategoryOption {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

export interface AdminVariantRow {
  id: string;
  productId: string;
  size: VariantSize;
  color: string;
  colorHex: string;
  sku: string | null;
  stockQty: number;
  /** Alias for `stockQty` so callers reading `.stock` or `.stockQty` see the same integer. */
  stock: number;
  priceOverrideCents: number | null;
  discontinued: boolean;
}

export interface AdminProductImageRow {
  id: string;
  path: string;
  altText: string;
  position: number;
}

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  basePriceCents: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  variantCount: number;
  totalStock: number;
  createdAt: Date;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  composition: string;
  care: string;
  status: ProductStatus;
  basePriceCents: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  createdAt: Date;
  updatedAt: Date;
  images: AdminProductImageRow[];
  variants: AdminVariantRow[];
  totalStock: number;
}

export type CreateAdminProductResult =
  | { ok: true; product: AdminProductDetail }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Normalizes a product name or custom slug into a URL-safe lowercase slug.
 */
export function slugifyProductName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "product";
}

function buildBaseSku(slug: string, size: VariantSize, color: string): string {
  const slugToken = slugifyProductName(slug)
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase();
  const colorToken = slugifyProductName(color)
    .replace(/-/g, "")
    .slice(0, 6)
    .toUpperCase();
  return `JA-${slugToken || "PROD"}-${size}-${colorToken || "CLR"}`;
}

/**
 * Lists all catalog categories for the admin product creation form.
 */
export async function listAdminCategories(db: Db): Promise<AdminCategoryOption[]> {
  return db
    .select({
      id: category.id,
      slug: category.slug,
      name: category.name,
      sortOrder: category.sortOrder,
    })
    .from(category)
    .orderBy(asc(category.sortOrder), asc(category.name));
}

/**
 * Lists all products across all statuses (draft, published, archived) for the
 * backoffice product index, including variant count and total stock across variants.
 */
export async function listAdminProducts(db: Db): Promise<AdminProductListItem[]> {
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      status: product.status,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      categoryId: product.categoryId,
      categoryName: category.name,
      categorySlug: category.slug,
      createdAt: product.createdAt,
    })
    .from(product)
    .innerJoin(category, eq(category.id, product.categoryId))
    .orderBy(desc(product.createdAt), asc(product.name));

  if (rows.length === 0) {
    return [];
  }

  const productIds = rows.map((r) => r.id);
  const variantRows = await db
    .select({
      productId: variant.productId,
      stockQty: variant.stockQty,
    })
    .from(variant)
    .where(inArray(variant.productId, productIds));

  const statsByProduct = new Map<string, { variantCount: number; totalStock: number }>();
  for (const v of variantRows) {
    const current = statsByProduct.get(v.productId) ?? { variantCount: 0, totalStock: 0 };
    current.variantCount += 1;
    current.totalStock += v.stockQty;
    statsByProduct.set(v.productId, current);
  }

  return rows.map((row) => {
    const stats = statsByProduct.get(row.id) ?? { variantCount: 0, totalStock: 0 };
    return {
      ...row,
      variantCount: stats.variantCount,
      totalStock: stats.totalStock,
    };
  });
}

/**
 * Retrieves a single product by ID for the backoffice (any status: draft,
 * published, or archived), including its category, images, and variants.
 */
export async function getAdminProductById(
  db: Db,
  productId: string,
): Promise<AdminProductDetail | null> {
  if (!UUID_REGEX.test(productId.trim())) {
    return null;
  }

  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      composition: product.composition,
      care: product.care,
      status: product.status,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      categoryId: product.categoryId,
      categoryName: category.name,
      categorySlug: category.slug,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    })
    .from(product)
    .innerJoin(category, eq(category.id, product.categoryId))
    .where(eq(product.id, productId.trim()))
    .limit(1);

  const found = rows[0];
  if (!found) {
    return null;
  }

  const images = await db
    .select({
      id: productImage.id,
      path: productImage.path,
      altText: productImage.altText,
      position: productImage.position,
    })
    .from(productImage)
    .where(eq(productImage.productId, found.id))
    .orderBy(asc(productImage.position));

  const variantRows = await db
    .select({
      id: variant.id,
      productId: variant.productId,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      sku: variant.sku,
      stockQty: variant.stockQty,
      priceOverrideCents: variant.priceOverrideCents,
      discontinued: variant.discontinued,
    })
    .from(variant)
    .where(eq(variant.productId, found.id))
    .orderBy(asc(variant.size), asc(variant.color));

  const mappedVariants: AdminVariantRow[] = variantRows.map((v) => ({
    ...v,
    stock: v.stockQty,
  }));

  const totalStock = mappedVariants.reduce((sum, v) => sum + v.stockQty, 0);

  return {
    ...found,
    images,
    variants: mappedVariants,
    totalStock,
  };
}

/**
 * Validates input and atomically creates a draft product, optional primary image,
 * and all size/color variants with their per-variant stock quantities.
 */
export async function createProductWithVariants(
  db: Db,
  rawInput: unknown,
): Promise<CreateAdminProductResult> {
  const validation = validateAdminProductInput(rawInput);
  if (!validation.ok) {
    return validation;
  }

  const input = validation.data;

  if (!UUID_REGEX.test(input.categoryId)) {
    return {
      ok: false,
      error: "Selected category does not exist.",
      fieldErrors: { categoryId: "Selected category does not exist." },
    };
  }

  return db.transaction(async (tx) => {
    const categoryRows = await tx
      .select({
        id: category.id,
        slug: category.slug,
        name: category.name,
      })
      .from(category)
      .where(eq(category.id, input.categoryId))
      .limit(1);

    const matchedCategory = categoryRows[0];
    if (!matchedCategory) {
      return {
        ok: false,
        error: "Selected category does not exist.",
        fieldErrors: { categoryId: "Selected category does not exist." },
      };
    }

    const baseSlug = slugifyProductName(input.slug ?? input.name);
    let candidateSlug = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await tx
        .select({ id: product.id })
        .from(product)
        .where(eq(product.slug, candidateSlug))
        .limit(1);
      if (existing.length === 0) {
        break;
      }
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const [createdProduct] = await tx
      .insert(product)
      .values({
        slug: candidateSlug,
        name: input.name,
        description: input.description,
        composition: input.composition,
        care: input.care,
        basePriceCents: input.basePriceCents,
        currency: "USD",
        categoryId: matchedCategory.id,
        status: "draft",
      })
      .returning();

    const createdImages: AdminProductImageRow[] = [];
    if (input.imageUrl) {
      const [img] = await tx
        .insert(productImage)
        .values({
          productId: createdProduct.id,
          path: input.imageUrl,
          altText: input.imageAlt ?? input.name,
          position: 0,
        })
        .returning();
      createdImages.push({
        id: img.id,
        path: img.path,
        altText: img.altText,
        position: img.position,
      });
    }

    const createdVariants: AdminVariantRow[] = [];
    for (const v of input.variants) {
      const baseSku = buildBaseSku(candidateSlug, v.size, v.color);
      let candidateSku = baseSku;
      let skuSuffix = 2;

      while (true) {
        const existingSku = await tx
          .select({ id: variant.id })
          .from(variant)
          .where(eq(variant.sku, candidateSku))
          .limit(1);
        if (existingSku.length === 0) {
          break;
        }
        candidateSku = `${baseSku}-${skuSuffix}`;
        skuSuffix += 1;
      }

      const [insertedVariant] = await tx
        .insert(variant)
        .values({
          productId: createdProduct.id,
          size: v.size,
          color: v.color,
          colorHex: v.colorHex,
          sku: candidateSku,
          stockQty: v.stockQty,
          priceOverrideCents: v.priceOverrideCents,
          discontinued: false,
        })
        .returning();

      createdVariants.push({
        id: insertedVariant.id,
        productId: insertedVariant.productId,
        size: insertedVariant.size,
        color: insertedVariant.color,
        colorHex: insertedVariant.colorHex,
        sku: insertedVariant.sku,
        stockQty: insertedVariant.stockQty,
        stock: insertedVariant.stockQty,
        priceOverrideCents: insertedVariant.priceOverrideCents,
        discontinued: insertedVariant.discontinued,
      });
    }

    const sizeOrder = new Map<VariantSize, number>([
      ["XS", 0],
      ["S", 1],
      ["M", 2],
      ["L", 3],
      ["XL", 4],
    ]);
    createdVariants.sort((a, b) => {
      const sDiff = (sizeOrder.get(a.size) ?? 0) - (sizeOrder.get(b.size) ?? 0);
      if (sDiff !== 0) return sDiff;
      return a.color.localeCompare(b.color);
    });

    const totalStock = createdVariants.reduce((sum, v) => sum + v.stockQty, 0);

    return {
      ok: true,
      product: {
        id: createdProduct.id,
        slug: createdProduct.slug,
        name: createdProduct.name,
        description: createdProduct.description,
        composition: createdProduct.composition,
        care: createdProduct.care,
        status: createdProduct.status,
        basePriceCents: createdProduct.basePriceCents,
        currency: createdProduct.currency,
        categoryId: matchedCategory.id,
        categoryName: matchedCategory.name,
        categorySlug: matchedCategory.slug,
        createdAt: createdProduct.createdAt,
        updatedAt: createdProduct.updatedAt,
        images: createdImages,
        variants: createdVariants,
        totalStock,
      },
    };
  });
}
