import { bigint, char, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { account, address } from "./account.ts";
import { cart } from "./cart.ts";
import { variant } from "./catalog.ts";
import { fulfillmentStatus, orderStatus, paymentStatus } from "./enums.ts";

// Order side of the schema (docs/domain-model.md). Order lines freeze a
// snapshot of the purchased product/variant and its price at purchase time,
// so the snapshot columns are plain text/number copies, not references.

export const shippingMethod = pgTable("shipping_method", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** Shipping cost in integer cents. */
  costCents: bigint("cost_cents", { mode: "number" }).notNull(),
  deliveryEstimate: text("delivery_estimate").notNull(),
});

export type ShippingMethod = typeof shippingMethod.$inferSelect;
export type NewShippingMethod = typeof shippingMethod.$inferInsert;

export const order = pgTable("order", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human-readable order reference shown to the shopper (e.g. JA-000123). */
  reference: text("reference").notNull().unique(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => account.id),
  contactEmail: text("contact_email").notNull(),
  status: orderStatus("status").notNull().default("created"),
  /** Null until the order is paid (docs/domain-model.md). */
  fulfillmentStatus: fulfillmentStatus("fulfillment_status"),
  addressId: uuid("address_id")
    .notNull()
    .references(() => address.id),
  shippingMethodId: uuid("shipping_method_id")
    .notNull()
    .references(() => shippingMethod.id),
  // Totals frozen at purchase time, all in integer cents.
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
  shippingCents: bigint("shipping_cents", { mode: "number" }).notNull(),
  taxCents: bigint("tax_cents", { mode: "number" }).notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;

export const orderLine = pgTable("order_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => order.id),
  /** Nullable: the frozen snapshot below is authoritative once the order exists. */
  variantId: uuid("variant_id").references(() => variant.id),
  productName: text("product_name").notNull(),
  variantSize: text("variant_size").notNull(),
  variantColor: text("variant_color").notNull(),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
});

export type OrderLine = typeof orderLine.$inferSelect;
export type NewOrderLine = typeof orderLine.$inferInsert;

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => order.id),
  status: paymentStatus("status").notNull().default("pending"),
  provider: text("provider").notNull().default("simulated"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;

export const checkoutSession = pgTable("checkout_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id")
    .notNull()
    .unique()
    .references(() => cart.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  recipientName: text("recipient_name").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: char("state", { length: 2 }).notNull(),
  zip: text("zip").notNull(),
  country: char("country", { length: 2 }).notNull().default("US"),
  phone: text("phone"),
  shippingMethodId: uuid("shipping_method_id").references(() => shippingMethod.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CheckoutSession = typeof checkoutSession.$inferSelect;
export type NewCheckoutSession = typeof checkoutSession.$inferInsert;
