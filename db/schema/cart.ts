import { sql } from "drizzle-orm";
import { check, integer, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { account } from "./account.ts";
import { variant } from "./catalog.ts";
import { cartStatus } from "./enums.ts";

// Shopping side of the schema (docs/domain-model.md). A guest cart has no
// owner (account_id is null) until payment links it to an account.

export const cart = pgTable("cart", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Guest session cookie value; one active cart per session. */
  sessionToken: text("session_token").notNull().unique(),
  accountId: uuid("account_id").references(() => account.id),
  status: cartStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Cart = typeof cart.$inferSelect;
export type NewCart = typeof cart.$inferInsert;

export const cartLine = pgTable(
  "cart_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => cart.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variant.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    unique("uq_cart_line_cart_variant").on(t.cartId, t.variantId),
    check("chk_cart_line_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export type CartLine = typeof cartLine.$inferSelect;
export type NewCartLine = typeof cartLine.$inferInsert;
