// Pure mapping from a provider `PaymentEvent` to a presentation view. No React,
// no Next.js, no DB: the same view feeds any surface. `pending` is its own
// outcome — it is never collapsed into success or failure.

import type { PaymentEvent, PaymentOutcome } from "./payment-provider.ts";
import { formatPriceUSD } from "../lib/money.ts";

export interface PaymentOutcomeView {
  outcome: PaymentOutcome;
  title: string;
  message: string;
  retryable: boolean;
  /** Integer number of cents, carried through unchanged from the event. */
  amountCents: number;
  /** The amount rendered as USD (e.g. 24900 -> "$249.00"). */
  amountLabel: string;
}

export function describePaymentOutcome(event: PaymentEvent): PaymentOutcomeView {
  const amountCents = event.amountCents;
  const amountLabel = formatPriceUSD(amountCents);

  switch (event.type) {
    case "payment.succeeded":
      return {
        outcome: "succeeded",
        title: "Payment confirmed",
        message: "Your payment was approved. We're preparing your order.",
        retryable: false,
        amountCents,
        amountLabel,
      };
    case "payment.failed":
      return {
        outcome: "failed",
        title: "Payment failed",
        message:
          "We couldn't process your payment. No charge was made and your cart is unchanged.",
        retryable: true,
        amountCents,
        amountLabel,
      };
    case "payment.pending":
      return {
        outcome: "pending",
        title: "Payment pending",
        message:
          "Your payment is still being confirmed. We'll update this page once the provider responds.",
        retryable: false,
        amountCents,
        amountLabel,
      };
  }
}
