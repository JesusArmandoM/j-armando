import { describe, expect, it } from "vitest";
import type { PaymentEvent } from "./payment-provider.ts";
import { describePaymentOutcome } from "./payment-outcome.ts";

const base = {
  providerRef: "sim_cart-1",
  reference: "cart-1",
  amountCents: 24900,
  currency: "USD",
} as const;

const succeeded: PaymentEvent = { type: "payment.succeeded", ...base };
const failed: PaymentEvent = { type: "payment.failed", reason: "card_declined", ...base };
const pending: PaymentEvent = { type: "payment.pending", ...base };

describe("describePaymentOutcome", () => {
  it("maps a succeeded event to a confirmable success view", () => {
    const view = describePaymentOutcome(succeeded);

    expect(view.outcome).toBe("succeeded");
    expect(view.title).toBe("Payment confirmed");
    expect(view.message).toContain("approved");
    expect(view.retryable).toBe(false);
  });

  it("maps a failed event to a retryable failure view", () => {
    const view = describePaymentOutcome(failed);

    expect(view.outcome).toBe("failed");
    expect(view.title).toBe("Payment failed");
    expect(view.message).toContain("No charge was made");
    expect(view.retryable).toBe(true);
  });

  it("maps a pending event to a pending view that is not presented as success", () => {
    const view = describePaymentOutcome(pending);

    expect(view.outcome).toBe("pending");
    expect(view.title).toBe("Payment pending");
    expect(view.message).toContain("still being confirmed");
    expect(view.retryable).toBe(false);
    expect(view.outcome).not.toBe("succeeded");
    expect(view.outcome).not.toBe("failed");
  });

  it("carries the amount as integer cents and renders it as USD", () => {
    const view = describePaymentOutcome(succeeded);

    expect(Number.isInteger(view.amountCents)).toBe(true);
    expect(view.amountCents).toBe(24900);
    expect(view.amountLabel).toBe("$249.00");
  });
});
