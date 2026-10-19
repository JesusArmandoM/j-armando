import { revalidatePath } from "next/cache";

import { readCartSessionToken } from "@/app/cart/session.ts";
import {
  getCheckoutSession,
  listShippingMethods,
  saveCheckoutShippingMethod,
} from "@/db/checkout.ts";
import { getDb } from "@/db/client.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (
    !body ||
    typeof body !== "object" ||
    !("shippingMethodId" in body) ||
    typeof (body as { shippingMethodId: unknown }).shippingMethodId !== "string"
  ) {
    return Response.json(
      { error: "Please select a valid shipping method." },
      { status: 400, headers: NO_STORE },
    );
  }

  const shippingMethodId = (body as { shippingMethodId: string }).shippingMethodId.trim();
  if (!UUID_REGEX.test(shippingMethodId)) {
    return Response.json(
      { error: "Please select a valid shipping method." },
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
    const result = await saveCheckoutShippingMethod(
      getDb(),
      sessionToken,
      shippingMethodId,
    );

    if (!result.ok) {
      if (result.reason === "cart_not_found") {
        return Response.json(
          { error: "No active cart found for this session." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "address_required") {
        return Response.json(
          { error: "Please complete contact and shipping address first." },
          { status: 400, headers: NO_STORE },
        );
      }
      return Response.json(
        { error: "The selected shipping method is not available." },
        { status: 400, headers: NO_STORE },
      );
    }

    revalidatePath("/checkout");
    return Response.json(
      {
        ok: true,
        checkoutSession: {
          id: result.checkoutSession.id,
          shippingMethodId: result.checkoutSession.shippingMethodId,
          shippingMethod: {
            id: result.shippingMethod.id,
            slug: result.shippingMethod.slug,
            name: result.shippingMethod.name,
            description: result.shippingMethod.description,
            costCents: result.shippingMethod.costCents,
            deliveryEstimate: result.shippingMethod.deliveryEstimate,
          },
        },
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to save checkout shipping method.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not save shipping method. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const methods = await listShippingMethods(db);

    const sessionToken = await readCartSessionToken();
    let selectedShippingMethodId: string | null = null;
    if (sessionToken) {
      const session = await getCheckoutSession(db, sessionToken);
      selectedShippingMethodId = session?.shippingMethodId ?? null;
    }

    return Response.json(
      {
        shippingMethods: methods,
        selectedShippingMethodId,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to list shipping methods.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not load shipping methods." },
      { status: 503, headers: NO_STORE },
    );
  }
}
