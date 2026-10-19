// Pure input contract shared by the add-to-cart control and the
// `POST /api/cart/lines` route handler. No React, no Next.js, no DB: the same
// bounds and id-shape rule are used on the client and re-checked on the server.

/** Largest quantity a shopper may add in one request. */
export const MAX_ADD_QUANTITY = 10;

/** Canonical 8-4-4-4-12 hexadecimal UUID shape (version agnostic). */
const VARIANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AddToCartInput {
  variantId: string;
  quantity: number;
}

export type AddToCartParseResult =
  | { ok: true; value: AddToCartInput }
  | { ok: false; error: string };

/** True when the string has the UUID shape PostgreSQL expects. */
export function isVariantIdShape(value: string): boolean {
  return VARIANT_ID_PATTERN.test(value);
}

/**
 * Validates an untrusted request body. The client may send only a variant id
 * and a quantity: no cart/session identifier, price or product slug is read.
 */
export function parseAddToCartBody(body: unknown): AddToCartParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { variantId, quantity } = body as {
    variantId?: unknown;
    quantity?: unknown;
  };

  if (typeof variantId !== "string" || !isVariantIdShape(variantId.trim())) {
    return { ok: false, error: "A valid variant is required." };
  }

  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ADD_QUANTITY
  ) {
    return {
      ok: false,
      error: `Quantity must be a whole number from 1 to ${MAX_ADD_QUANTITY}.`,
    };
  }

  return { ok: true, value: { variantId: variantId.trim(), quantity } };
}
