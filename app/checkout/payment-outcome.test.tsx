import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PaymentEvent, PaymentRequest } from "@/payments/payment-provider.ts";
import { describePaymentOutcome } from "@/payments/payment-outcome.ts";
import { createSimulatedPaymentProvider } from "@/payments/simulated-provider.ts";
import { PaymentOutcomeNotice } from "./payment-outcome";

const base = {
  providerRef: "sim_cart-1",
  reference: "cart-1",
  amountCents: 24900,
  currency: "USD",
} as const;

const succeeded: PaymentEvent = { type: "payment.succeeded", ...base };
const failed: PaymentEvent = { type: "payment.failed", reason: "card_declined", ...base };
const pending: PaymentEvent = { type: "payment.pending", ...base };

describe("PaymentOutcomeNotice", () => {
  it("renders a distinct success state for a succeeded payment", () => {
    render(<PaymentOutcomeNotice view={describePaymentOutcome(succeeded)} />);

    const notice = screen.getByTestId("payment-outcome");
    expect(notice.getAttribute("data-outcome")).toBe("succeeded");
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(
      screen.getByRole("heading", { level: 2, name: "Payment confirmed" }),
    ).toBeTruthy();
    expect(screen.getByTestId("payment-outcome-amount").textContent).toBe("$249.00");
    expect(screen.queryByTestId("payment-outcome-retry")).toBeNull();
  });

  it("renders a distinct failure state with a retry affordance for a failed payment", () => {
    render(<PaymentOutcomeNotice view={describePaymentOutcome(failed)} />);

    const notice = screen.getByTestId("payment-outcome");
    expect(notice.getAttribute("data-outcome")).toBe("failed");
    expect(
      screen.getByRole("heading", { level: 2, name: "Payment failed" }),
    ).toBeTruthy();
    expect(screen.getByText(/No charge was made/)).toBeTruthy();
    expect(screen.getByTestId("payment-outcome-retry")).toBeTruthy();
  });

  it("renders a distinct pending state that is not shown as success or failure", () => {
    render(<PaymentOutcomeNotice view={describePaymentOutcome(pending)} />);

    const notice = screen.getByTestId("payment-outcome");
    expect(notice.getAttribute("data-outcome")).toBe("pending");
    expect(
      screen.getByRole("heading", { level: 2, name: "Payment pending" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Payment confirmed" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Payment failed" })).toBeNull();
    expect(screen.queryByTestId("payment-outcome-retry")).toBeNull();
  });

  it("drives the simulated provider through succeed/fail/pending and surfaces each outcome", async () => {
    const request: PaymentRequest = {
      reference: "cart-1",
      amountCents: 24900,
      currency: "USD",
      method: { kind: "card", token: "tok_test_visa" },
    };
    const scenarios = [
      ["succeed", "succeeded"],
      ["fail", "failed"],
      ["pending", "pending"],
    ] as const;

    for (const [scenario, expectedOutcome] of scenarios) {
      const provider = createSimulatedPaymentProvider({ scenario });
      const event = await provider.createPayment(request);
      const { unmount } = render(
        <PaymentOutcomeNotice view={describePaymentOutcome(event)} />,
      );

      expect(screen.getByTestId("payment-outcome").getAttribute("data-outcome")).toBe(
        expectedOutcome,
      );
      unmount();
    }
  });
});
