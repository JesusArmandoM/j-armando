import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { productStatus, variantSize } from "./enums.ts";

// Catalog side of the schema (docs/domain-model.md).
// Money is stored as integer cents (see CONSTRAINTS.md); catalog prices are
// tax-exclusive (US market).

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    composition: text("composition").notNull(),
    care: text("care").notNull(),
    /** Tax-exclusive base price in integer cents. */
    basePriceCents: bigint("base_price_cents", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    status: productStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_product_status").on(t.status)],
);

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;

export const productImage = pgTable(
  "product_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    path: text("path").notNull(),
    altText: text("alt_text").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [unique("uq_product_image_product_position").on(t.productId, t.position)],
);

export type ProductImage = typeof productImage.$inferSelect;
export type NewProductImage = typeof productImage.$inferInsert;

export const variant = pgTable(
  "variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    size: variantSize("size").notNull(),
    color: text("color").notNull(),
    /** Swatch hex value for the shopper-facing color chip. */
    colorHex: text("color_hex").notNull(),
    sku: text("sku").unique(),
    /** Optional price that overrides the product base price, in integer cents. */
    priceOverrideCents: bigint("price_override_cents", { mode: "number" }),
    stockQty: integer("stock_qty").notNull().default(0),
    discontinued: boolean("discontinued").notNull().default(false),
  },
  (t) => [
    unique("uq_variant_product_size_color").on(t.productId, t.size, t.color),
    check("chk_variant_stock_qty_non_negative", sql`${t.stockQty} >= 0`),
  ],
);

export type Variant = typeof variant.$inferSelect;
export type NewVariant = typeof variant.$inferInsert;

/** Approximate body-measurement range in inches for one size. */
export interface SizeChartRange {
  min: number;
  max: number;
}

/**
 * Category-level body measurements. Keys are omitted when a measurement does
 * not apply to the garment type (for example, trousers have no sleeve).
 * Published as catalog content; the storefront and chat read the same rows.
 */
export interface SizeChartMeasurements {
  chest?: SizeChartRange;
  waist?: SizeChartRange;
  hip?: SizeChartRange;
  sleeve?: SizeChartRange;
  length?: SizeChartRange;
  inseam?: SizeChartRange;
  rise?: SizeChartRange;
}

export const sizeChart = pgTable(
  "size_chart",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    size: variantSize("size").notNull(),
    measurements: jsonb("measurements").$type<SizeChartMeasurements>().notNull(),
  },
  (t) => [unique("uq_size_chart_category_size").on(t.categoryId, t.size)],
);

export type SizeChart = typeof sizeChart.$inferSelect;
export type NewSizeChart = typeof sizeChart.$inferInsert;
