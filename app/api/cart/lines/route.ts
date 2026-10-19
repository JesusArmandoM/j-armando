import { revalidatePath } from "next/cache";

import { addVariantToCart, removeCartLine, updateCartLineQuantity } from "@/db/cart.ts";
import { getDb } from "@/db/client.ts";

import {
  parseAddToCartBody,
  parseRemoveCartLineBody,
  parseUpdateCartLineBody,
} from "@/app/cart/cart-input.ts";
import {
  createCartSessionToken,
  readCartSessionToken,
  setCartSessionCookie,
} from "@/app/cart/session.ts";

// Guest cart mutation endpoint. The body carries only `{ variantId, quantity }`
// for add, `{ lineId, quantity }` for update, and `{ lineId }` for remove:
// the cart is resolved exclusively from the httpOnly session cookie. Do not echo
// the cart id, user token or session token.
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  return /^application\/json(\s*;.*)?$/i.test(contentType);
}

export async function POST(request: Request): Promise<Response> {
  // 1. Reject malformed input before touching cookies or the database.
  if (!isJsonContentType(request)) {
    return jsonError("Request body must be JSON.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = parseAddToCartBody(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  // 2. The cookie is the only cart credential. A guest without one gets a
  // token generated in memory; the cookie is persisted only after a
  // successful add, so rejected requests never mint an identity.
  try {
    const existingToken = await readCartSessionToken();
    const sessionToken = existingToken ?? createCartSessionToken();

    // 3. Validation and the upsert happen in one repository transaction.
    const result = await addVariantToCart(
      getDb(),
      sessionToken,
      parsed.value.variantId,
      parsed.value.quantity,
    );

    if (!result.ok) {
      if (result.reason === "stock_exceeded") {
        return Response.json(
          {
            error: `Only ${result.available} item${result.available === 1 ? "" : "s"} available in stock.`,
            code: "stock_exceeded",
            available: result.available,
          },
          { status: 400, headers: NO_STORE },
        );
      }
      return jsonError("This variant is no longer available.", 400);
    }

    // 4. Persist a newly generated token only now that the line exists. An
    // existing cookie is reused unchanged (no redundant Set-Cookie).
    if (existingToken === undefined) {
      await setCartSessionCookie(sessionToken);
    }

    // 5. Read-your-own-writes for the cart page. The response never includes
    // the cart id, line id or session token.
    revalidatePath("/cart");
    return Response.json({ lineQuantity: result.lineQuantity }, { headers: NO_STORE });
  } catch (error) {
    // Generic message only: no cookie value, cart id or shopper data.
    console.error("Failed to add a variant to the cart.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError("We could not add this item to your cart. Please try again.", 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isJsonContentType(request)) {
    return jsonError("Request body must be JSON.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = parseUpdateCartLineBody(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  try {
    const sessionToken = await readCartSessionToken();
    if (!sessionToken) {
      return jsonError("Cart line not found.", 404);
    }

    const result = await updateCartLineQuantity(
      getDb(),
      sessionToken,
      parsed.value.lineId,
      parsed.value.quantity,
    );

    if (!result.ok) {
      if (result.reason === "stock_exceeded") {
        return Response.json(
          {
            error: `Only ${result.available} item${result.available === 1 ? "" : "s"} available in stock.`,
            code: "stock_exceeded",
            available: result.available,
          },
          { status: 400, headers: NO_STORE },
        );
      }
      return jsonError("Cart line not found.", 404);
    }

    revalidatePath("/cart");
    return Response.json(
      { lineId: result.lineId, lineQuantity: result.quantity },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to update cart line quantity.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError("We could not update this cart item. Please try again.", 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isJsonContentType(request)) {
    return jsonError("Request body must be JSON.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = parseRemoveCartLineBody(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  try {
    const sessionToken = await readCartSessionToken();
    if (!sessionToken) {
      return jsonError("Cart line not found.", 404);
    }

    const result = await removeCartLine(getDb(), sessionToken, parsed.value.lineId);

    if (!result.ok) {
      return jsonError("Cart line not found.", 404);
    }

    revalidatePath("/cart");
    return Response.json(
      { lineId: result.lineId, removed: true },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to remove cart line.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError("We could not remove this item from your cart. Please try again.", 503);
  }
}

