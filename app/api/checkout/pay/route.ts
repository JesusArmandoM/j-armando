import { revalidatePath } from "next/cache";

import { readCartSessionToken } from "@/app/cart/session.ts";
import { getDb } from "@/db/client.ts";
import { createPaidOrderFromCheckout } from "@/db/order.ts";
import type { PaymentScenario } from "@/db/order.ts";
import type { PaymentFailureReason } from "@/payments/payment-provider.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request?: Request): Promise<Response> {
  const sessionToken = await readCartSessionToken();
  if (!sessionToken) {
    return Response.json(
      { ok: false, error: "No active cart session found. Please add items to your cart first." },
      { status: 400, headers: NO_STORE },
    );
  }

  let scenario: PaymentScenario = "succeed";
  let failureReason: PaymentFailureReason = "card_declined";

  if (request) {
    const headerScenario = request.headers.get("x-payment-scenario");
    if (headerScenario === "fail" || headerScenario === "pending" || headerScenario === "succeed") {
      scenario = headerScenario;
    }
    const headerReason = request.headers.get("x-payment-failure-reason");
    if (
      headerReason === "card_declined" ||
      headerReason === "insufficient_funds" ||
      headerReason === "provider_error"
    ) {
      failureReason = headerReason;
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        if (body && typeof body === "object") {
          if (body.scenario === "fail" || body.scenario === "pending" || body.scenario === "succeed") {
            scenario = body.scenario;
          }
          if (
            body.failureReason === "card_declined" ||
            body.failureReason === "insufficient_funds" ||
            body.failureReason === "provider_error"
          ) {
            failureReason = body.failureReason;
          }
        }
      } catch {
        // Invalid or empty body falls back to defaults
      }
    }
  }

  try {
    const result = await createPaidOrderFromCheckout(getDb(), sessionToken, {
      scenario,
      failureReason,
    });

    if (!result.ok) {
      if (result.reason === "cart_not_found" || result.reason === "cart_empty") {
        return Response.json(
          { ok: false, error: "Your cart is empty. Please add items to your cart first." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "address_required") {
        return Response.json(
          { ok: false, error: "Please enter your contact email and shipping address first." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "shipping_method_required") {
        return Response.json(
          { ok: false, error: "Please select a shipping method before placing your order." },
          { status: 400, headers: NO_STORE },
        );
      }
      if (result.reason === "out_of_stock") {
        return Response.json(
          {
            ok: false,
            error:
              "One or more items in your cart are no longer available in the requested quantity. Please review your cart.",
            code: "out_of_stock",
            variantId: result.variantId,
            productName: result.productName,
          },
          { status: 409, headers: NO_STORE },
        );
      }
      if (result.reason === "payment_failed") {
        if (result.paymentOutcome === "payment.pending") {
          return Response.json(
            {
              ok: false,
              error: "Payment is pending authorization. Please wait or check your account.",
              code: "payment_pending",
              retryable: false,
            },
            { status: 400, headers: NO_STORE },
          );
        }

        const reason = result.failureReason ?? failureReason;
        const errorMessage =
          reason === "insufficient_funds"
            ? "Payment failed: Insufficient funds. Please try another payment method."
            : "Payment failed: The payment was declined. Please try another payment method.";

        return Response.json(
          {
            ok: false,
            error: errorMessage,
            code: "payment_failed",
            retryable: true,
            failureReason: reason,
          },
          { status: 400, headers: NO_STORE },
        );
      }
      return Response.json(
        {
          ok: false,
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
        accountId: result.accountId,
        isNewAccount: result.isNewAccount,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to process payment and create order:", error);
    return Response.json(
      { ok: false, error: "Unable to process payment right now. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}

