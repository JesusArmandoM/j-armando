import { and, asc, eq, gt, sql } from "drizzle-orm";

import type { Db } from "./client.ts";
import type { Cart, VariantSize } from "./schema/index.ts";
import { cart, cartLine, product, variant } from "./schema/index.ts";

// Guest shopping-cart repository. A cart belongs to an opaque session token
// (the httpOnly `ja_cart_session` cookie value) and keeps `account_id` null
// until payment links it to an account (docs/domain-model.md). Money stays in
// integer cents; nothing in this module knows about HTTP or Next.js.

/** Variant payload the cart accepts: published, not discontinued and in stock. */
export interface AddableVariant {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  size: VariantSize;
  color: string;
  /** Variant price override in integer cents, when set. */
  priceOverrideCents: number | null;
  basePriceCents: number;
  stockQty: number;
  currency: string;
}

/**
 * Resolves a variant that can be added to a cart right now: the product is
 * published, the variant is not discontinued and it has stock. Returns
 * `undefined` for unknown ids and every unavailable case, so the route can
 * reject without creating a cart.
 */
export async function getAddableVariant(
  db: Db,
  variantId: string,
): Promise<AddableVariant | undefined> {
  const rows = await db
    .select({
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      size: variant.size,
      color: variant.color,
      priceOverrideCents: variant.priceOverrideCents,
      basePriceCents: product.basePriceCents,
      stockQty: variant.stockQty,
      currency: product.currency,
    })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .where(
      and(
        eq(variant.id, variantId),
        eq(product.status, "published"),
        eq(variant.discontinued, false),
        gt(variant.stockQty, 0),
      ),
    )
    .limit(1);

  return rows[0];
}

/**
 * Returns the cart for a session token, creating it once when absent. The
 * unique `session_token` is the concurrency guard: an insert that loses the
 * race does nothing and the row is re-read. `account_id` is never set here.
 */
export async function getOrCreateCart(db: Db, sessionToken: string): Promise<Cart> {
  const existing = await db
    .select()
    .from(cart)
    .where(eq(cart.sessionToken, sessionToken))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(cart)
    .values({ sessionToken })
    .onConflictDoNothing({ target: cart.sessionToken })
    .returning();
  if (inserted[0]) return inserted[0];

  // Concurrent create won the insert; the row is visible once that transaction
  // commits (PostgreSQL re-checks the conflicting insert after the commit).
  const rows = await db
    .select()
    .from(cart)
    .where(eq(cart.sessionToken, sessionToken))
    .limit(1);
  if (!rows[0]) {
    throw new Error("cart could not be created for this session");
  }
  return rows[0];
}

export type AddVariantResult =
  | { ok: true; cartId: string; lineId: string; lineQuantity: number }
  | { ok: false; reason: "variant_unavailable" };

/**
 * Adds `quantity` of a variant to the session cart in one transaction.
 *
 * The variant is resolved **before** any cart is created, so unavailable
 * variants never write. The line is upserted on the unique
 * `(cart_id, variant_id)` key: a repeat add increments the existing quantity
 * atomically (`quantity = quantity + n`) instead of creating a duplicate row.
 */
export async function addVariantToCart(
  db: Db,
  sessionToken: string,
  variantId: string,
  quantity: number,
): Promise<AddVariantResult> {
  return db.transaction(async (tx) => {
    // The transaction handle exposes the same query builder methods as `Db`.
    const txDb = tx as unknown as Db;

    const addable = await getAddableVariant(txDb, variantId);
    if (!addable) {
      return { ok: false, reason: "variant_unavailable" } as const;
    }

    const currentCart = await getOrCreateCart(txDb, sessionToken);

    const [line] = await txDb
      .insert(cartLine)
      .values({ cartId: currentCart.id, variantId, quantity })
      .onConflictDoUpdate({
        target: [cartLine.cartId, cartLine.variantId],
        set: { quantity: sql`${cartLine.quantity} + ${quantity}` },
      })
      .returning({ id: cartLine.id, quantity: cartLine.quantity });

    await txDb
      .update(cart)
      .set({ updatedAt: new Date() })
      .where(eq(cart.id, currentCart.id));

    return {
      ok: true,
      cartId: currentCart.id,
      lineId: line.id,
      lineQuantity: line.quantity,
    } as const;
  });
}

/** One rendered cart line; money values stay integer cents. */
export interface CartSummaryLine {
  lineId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  size: VariantSize;
  color: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CartSummary {
  lines: CartSummaryLine[];
  lineCount: number;
  subtotalCents: number;
  currency: string;
}

/**
 * Read-only summary of the active cart for a session token. Prices use the
 * variant override when present, otherwise the product base price. Returns
 * `undefined` when the token has no active cart (a read never creates one).
 */
export async function getCartSummary(
  db: Db,
  sessionToken: string,
): Promise<CartSummary | undefined> {
  const rows = await db
    .select({
      lineId: cartLine.id,
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      size: variant.size,
      color: variant.color,
      quantity: cartLine.quantity,
      priceOverrideCents: variant.priceOverrideCents,
      basePriceCents: product.basePriceCents,
      currency: product.currency,
    })
    .from(cart)
    .innerJoin(cartLine, eq(cartLine.cartId, cart.id))
    .innerJoin(variant, eq(variant.id, cartLine.variantId))
    .innerJoin(product, eq(product.id, variant.productId))
    .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
    .orderBy(asc(product.name), asc(variant.size), asc(variant.color));

  if (rows.length === 0) {
    return undefined;
  }

  const lines: CartSummaryLine[] = rows.map((row) => {
    const unitPriceCents = row.priceOverrideCents ?? row.basePriceCents;
    return {
      lineId: row.lineId,
      variantId: row.variantId,
      productSlug: row.productSlug,
      productName: row.productName,
      size: row.size,
      color: row.color,
      quantity: row.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * row.quantity,
    };
  });

  return {
    lines,
    lineCount: lines.length,
    subtotalCents: lines.reduce((total, line) => total + line.lineTotalCents, 0),
    currency: rows[0].currency,
  };
}

export type UpdateCartLineResult =
  | { ok: true; lineId: string; quantity: number }
  | { ok: false; reason: "not_found" };

/**
 * Updates the quantity of a line belonging to the session cart.
 * Enforces session isolation: returns `not_found` if the line does not exist
 * or belongs to a different cart.
 */
export async function updateCartLineQuantity(
  db: Db,
  sessionToken: string,
  lineId: string,
  quantity: number,
): Promise<UpdateCartLineResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    const currentCart = await txDb
      .select({ id: cart.id })
      .from(cart)
      .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
      .limit(1);

    if (!currentCart[0]) {
      return { ok: false, reason: "not_found" } as const;
    }

    const updated = await txDb
      .update(cartLine)
      .set({ quantity })
      .where(and(eq(cartLine.id, lineId), eq(cartLine.cartId, currentCart[0].id)))
      .returning({ id: cartLine.id, quantity: cartLine.quantity });

    if (!updated[0]) {
      return { ok: false, reason: "not_found" } as const;
    }

    await txDb
      .update(cart)
      .set({ updatedAt: new Date() })
      .where(eq(cart.id, currentCart[0].id));

    return { ok: true, lineId: updated[0].id, quantity: updated[0].quantity } as const;
  });
}

export type RemoveCartLineResult =
  | { ok: true; lineId: string }
  | { ok: false; reason: "not_found" };

/**
 * Removes a line belonging to the session cart.
 * Enforces session isolation: returns `not_found` if the line does not exist
 * or belongs to a different cart.
 */
export async function removeCartLine(
  db: Db,
  sessionToken: string,
  lineId: string,
): Promise<RemoveCartLineResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    const currentCart = await txDb
      .select({ id: cart.id })
      .from(cart)
      .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
      .limit(1);

    if (!currentCart[0]) {
      return { ok: false, reason: "not_found" } as const;
    }

    const deleted = await txDb
      .delete(cartLine)
      .where(and(eq(cartLine.id, lineId), eq(cartLine.cartId, currentCart[0].id)))
      .returning({ id: cartLine.id });

    if (!deleted[0]) {
      return { ok: false, reason: "not_found" } as const;
    }

    await txDb
      .update(cart)
      .set({ updatedAt: new Date() })
      .where(eq(cart.id, currentCart[0].id));

    return { ok: true, lineId: deleted[0].id } as const;
  });
}

