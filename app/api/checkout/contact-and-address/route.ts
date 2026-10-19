import { revalidatePath } from "next/cache";

import { readCartSessionToken } from "@/app/cart/session.ts";
import { parseCheckoutContactAndAddress } from "@/app/checkout/checkout-input.ts";
import { getCheckoutSession, saveCheckoutContactAndAddress } from "@/db/checkout.ts";
import { getDb } from "@/db/client.ts";
import { hashPassword } from "@/lib/auth/password.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  return /^application\/json(\s*;.*)?$/i.test(contentType);
}

export async function POST(request: Request): Promise<Response> {
  if (!isJsonContentType(request)) {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = parseCheckoutContactAndAddress(body);
  if (!parsed.ok) {
    return Response.json(
      {
        error: "Please correct the errors in the form.",
        errors: parsed.errors,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const sessionToken = await readCartSessionToken();
  if (!sessionToken) {
    return Response.json(
      { error: "No active cart session found. Please add items to your cart first." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    let passwordHash: string | null | undefined = undefined;
    if (parsed.data.password) {
      passwordHash = await hashPassword(parsed.data.password);
    } else if (
      typeof body === "object" &&
      body !== null &&
      "password" in body
    ) {
      passwordHash = null;
    }

    const result = await saveCheckoutContactAndAddress(getDb(), sessionToken, {
      ...parsed.data,
      passwordHash,
    });
    if (!result.ok) {
      return Response.json(
        { error: "No active cart found for this session." },
        { status: 400, headers: NO_STORE },
      );
    }

    revalidatePath("/checkout");
    return Response.json(
      {
        ok: true,
        checkoutSession: {
          id: result.checkoutSession.id,
          email: result.checkoutSession.email,
          recipientName: result.checkoutSession.recipientName,
          line1: result.checkoutSession.line1,
          line2: result.checkoutSession.line2,
          city: result.checkoutSession.city,
          state: result.checkoutSession.state,
          zip: result.checkoutSession.zip,
          country: result.checkoutSession.country,
          phone: result.checkoutSession.phone,
          hasPassword: Boolean(result.checkoutSession.passwordHash),
        },
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to save checkout contact and address.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not save contact and shipping address. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function GET(): Promise<Response> {
  const sessionToken = await readCartSessionToken();
  if (!sessionToken) {
    return Response.json({ checkoutSession: null }, { headers: NO_STORE });
  }

  try {
    const session = await getCheckoutSession(getDb(), sessionToken);
    if (!session) {
      return Response.json({ checkoutSession: null }, { headers: NO_STORE });
    }
    const { passwordHash: _hash, ...safeSession } = session;
    return Response.json(
      {
        checkoutSession: {
          ...safeSession,
          hasPassword: Boolean(_hash),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to read checkout session.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not read checkout session." },
      { status: 503, headers: NO_STORE },
    );
  }
}
