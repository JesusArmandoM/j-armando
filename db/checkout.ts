import { and, asc, eq } from "drizzle-orm";

import type { Db } from "./client.ts";
import type { CheckoutSession, ShippingMethod } from "./schema/index.ts";
import { cart, checkoutSession, shippingMethod } from "./schema/index.ts";

// Checkout repository. Checkout state belongs to an active cart identified by
// the session token (the httpOnly `ja_cart_session` cookie value).
// Nothing in this module knows about HTTP or Next.js.

export interface CheckoutContactAndAddressInput {
  email: string;
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string | null;
  passwordHash?: string | null;
}

export interface CheckoutSessionWithShipping extends CheckoutSession {
  shippingMethod?: ShippingMethod | null;
}

/**
 * Returns all available shipping methods ordered by cost ascending.
 */
export async function listShippingMethods(db: Db): Promise<ShippingMethod[]> {
  return db
    .select()
    .from(shippingMethod)
    .orderBy(asc(shippingMethod.costCents));
}

/**
 * Returns a shipping method by ID, or undefined if not found.
 */
export async function getShippingMethodById(
  db: Db,
  id: string,
): Promise<ShippingMethod | undefined> {
  const rows = await db
    .select()
    .from(shippingMethod)
    .where(eq(shippingMethod.id, id))
    .limit(1);

  return rows[0];
}

/**
 * Returns the checkout session for an active cart identified by sessionToken,
 * along with the selected shipping method if one has been chosen,
 * or undefined if no cart or checkout session exists.
 */
export async function getCheckoutSession(
  db: Db,
  sessionToken: string,
): Promise<CheckoutSessionWithShipping | undefined> {
  const rows = await db
    .select({
      session: checkoutSession,
      shippingMethod: shippingMethod,
    })
    .from(cart)
    .innerJoin(checkoutSession, eq(checkoutSession.cartId, cart.id))
    .leftJoin(shippingMethod, eq(checkoutSession.shippingMethodId, shippingMethod.id))
    .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
    .limit(1);

  if (!rows[0]) {
    return undefined;
  }

  return {
    ...rows[0].session,
    shippingMethod: rows[0].shippingMethod ?? null,
  };
}

export type SaveCheckoutResult =
  | { ok: true; checkoutSession: CheckoutSession }
  | { ok: false; reason: "cart_not_found" };

/**
 * Persists contact email and shipping address for the active cart identified by sessionToken.
 * Upserts on (cart_id) so subsequent edits update the existing checkout session without clearing shippingMethodId.
 */
export async function saveCheckoutContactAndAddress(
  db: Db,
  sessionToken: string,
  input: CheckoutContactAndAddressInput,
): Promise<SaveCheckoutResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    const [activeCart] = await txDb
      .select({ id: cart.id })
      .from(cart)
      .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
      .limit(1);

    if (!activeCart) {
      return { ok: false, reason: "cart_not_found" } as const;
    }

    const email = input.email.toLowerCase().trim();
    const recipientName = input.recipientName.trim();
    const line1 = input.line1.trim();
    const line2 = input.line2?.trim() || null;
    const city = input.city.trim();
    const state = input.state.toUpperCase().trim();
    const zip = input.zip.trim();
    const country = input.country?.toUpperCase().trim() || "US";
    const phone = input.phone?.trim() || null;
    const passwordHash = input.passwordHash ?? null;
    const now = new Date();

    const [saved] = await txDb
      .insert(checkoutSession)
      .values({
        cartId: activeCart.id,
        email,
        recipientName,
        line1,
        line2,
        city,
        state,
        zip,
        country,
        phone,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: checkoutSession.cartId,
        set: {
          email,
          recipientName,
          line1,
          line2,
          city,
          state,
          zip,
          country,
          phone,
          ...(input.passwordHash !== undefined ? { passwordHash } : {}),
          updatedAt: now,
        },
      })
      .returning();

    return { ok: true, checkoutSession: saved } as const;
  });
}

export type SaveShippingMethodResult =
  | { ok: true; checkoutSession: CheckoutSession; shippingMethod: ShippingMethod }
  | { ok: false; reason: "cart_not_found" | "address_required" | "shipping_method_not_found" };

/**
 * Persists the selected shipping method for the active checkout session identified by sessionToken.
 * Requires an active cart and an existing checkout session (Step 1 complete).
 */
export async function saveCheckoutShippingMethod(
  db: Db,
  sessionToken: string,
  shippingMethodId: string,
): Promise<SaveShippingMethodResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    const [activeCart] = await txDb
      .select({ id: cart.id })
      .from(cart)
      .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
      .limit(1);

    if (!activeCart) {
      return { ok: false, reason: "cart_not_found" } as const;
    }

    const [existingSession] = await txDb
      .select()
      .from(checkoutSession)
      .where(eq(checkoutSession.cartId, activeCart.id))
      .limit(1);

    if (!existingSession) {
      return { ok: false, reason: "address_required" } as const;
    }

    const [chosenMethod] = await txDb
      .select()
      .from(shippingMethod)
      .where(eq(shippingMethod.id, shippingMethodId))
      .limit(1);

    if (!chosenMethod) {
      return { ok: false, reason: "shipping_method_not_found" } as const;
    }

    const now = new Date();
    const [saved] = await txDb
      .update(checkoutSession)
      .set({
        shippingMethodId: chosenMethod.id,
        updatedAt: now,
      })
      .where(eq(checkoutSession.id, existingSession.id))
      .returning();

    return { ok: true, checkoutSession: saved, shippingMethod: chosenMethod } as const;
  });
}
