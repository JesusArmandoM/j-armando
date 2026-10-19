import { and, eq } from "drizzle-orm";

import type { Db } from "./client.ts";
import type { CheckoutSession } from "./schema/index.ts";
import { cart, checkoutSession } from "./schema/index.ts";

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
}

/**
 * Returns the checkout session for an active cart identified by sessionToken,
 * or undefined if no cart or checkout session exists.
 */
export async function getCheckoutSession(
  db: Db,
  sessionToken: string,
): Promise<CheckoutSession | undefined> {
  const rows = await db
    .select({
      session: checkoutSession,
    })
    .from(cart)
    .innerJoin(checkoutSession, eq(checkoutSession.cartId, cart.id))
    .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
    .limit(1);

  return rows[0]?.session;
}

export type SaveCheckoutResult =
  | { ok: true; checkoutSession: CheckoutSession }
  | { ok: false; reason: "cart_not_found" };

/**
 * Persists contact email and shipping address for the active cart identified by sessionToken.
 * Upserts on (cart_id) so subsequent edits update the existing checkout session.
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
          updatedAt: now,
        },
      })
      .returning();

    return { ok: true, checkoutSession: saved } as const;
  });
}
