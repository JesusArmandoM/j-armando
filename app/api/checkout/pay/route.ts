import { revalidatePath } from "next/cache";

import { readCartSessionToken } from "@/app/cart/session.ts";
import { getDb } from "@/db/client.ts";
import { createPaidOrderFromCheckout } from "@/db/order.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(): Promise<Response> {
  const sessionToken = await readCartSessionToken();
  if (!sessionToken) {
    return Response.json(
      { error: "No active cart session found. Please add items to your cart first." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await createPaidOrderFromCheckout(getDb(), sessionToken);

    if (!result.ok) {
      if (result.reason === "cart_not_found" || result.reason === "cart_empty") {
        return Response.json(
          { error: "Your cart is empty. Please add items to your cart first." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "address_required") {
        return Response.json(
          { error: "Please enter your contact email and shipping address first." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "shipping_method_required") {
        return Response.json(
          { error: "Please select a shipping method before placing your order." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "out_of_stock") {
        return Response.json(
          {
            error:
              "One or more items in your cart are no longer available in the requested quantity. Please review your cart.",
            code: "out_of_stock",
            variantId: result.variantId,
            productName: result.productName,
          },
          { status: 409, headers: NO_STORE },
        );
      }
      return Response.json(
        {
          error: "Payment simulation failed. Please try again.",
          failureReason: result.failureReason,
        },
        { status: 400, headers: NO_STORE },
      );
    }

    revalidatePath("/cart");
    revalidatePath("/checkout");

    const redirectUrl = `/checkout/confirmation/${result.order.reference}`;

    return Response.json(
      {
        ok: true,
        reference: result.order.reference,
        redirectUrl,
        order: result.order,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to process payment and create order:", error);
    return Response.json(
      { error: "Unable to process payment right now. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}
