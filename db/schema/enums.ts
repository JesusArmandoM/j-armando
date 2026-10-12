import { pgEnum } from "drizzle-orm/pg-core";

// PostgreSQL enums for the catalog/cart/order/account schema.
// Constraint of this codebase: TypeScript scripts run with Node's native type
// stripping, so only erasable syntax is allowed here — Drizzle pgEnum values
// instead of TS `enum`/`namespace` declarations (see ARCHITECTURE.md).

/** Product lifecycle states (docs/domain-model.md): draft -> published -> archived. */
export const productStatus = pgEnum("product_status", ["draft", "published", "archived"]);
export type ProductStatus = (typeof productStatus.enumValues)[number];

/** Garment sizes (XS-XL), a dimension of the variant matrix (CONTEXT.md). */
export const variantSize = pgEnum("variant_size", ["XS", "S", "M", "L", "XL"]);
export type VariantSize = (typeof variantSize.enumValues)[number];

/** Cart lifecycle states (docs/domain-model.md). */
export const cartStatus = pgEnum("cart_status", ["active", "converted", "expired"]);
export type CartStatus = (typeof cartStatus.enumValues)[number];

/** Roles are attributes of the account (docs/user-and-access-model.md). */
export const accountRoleName = pgEnum("account_role_name", ["customer", "admin"]);
export type AccountRoleName = (typeof accountRoleName.enumValues)[number];

/** Order states (docs/domain-model.md). */
export const orderStatus = pgEnum("order_status", ["created", "paid", "failed", "cancelled"]);
export type OrderStatus = (typeof orderStatus.enumValues)[number];

/** Fulfillment states; only apply once an order is paid (docs/domain-model.md). */
export const fulfillmentStatus = pgEnum("fulfillment_status", ["preparing", "shipped", "delivered"]);
export type FulfillmentStatus = (typeof fulfillmentStatus.enumValues)[number];

/** Payment attempt states (docs/domain-model.md). */
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "cancelled"]);
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
