import { describe, expect, it } from "vitest";
import type { PaymentRequest } from "./payment-provider.ts";
import { createSimulatedPaymentProvider } from "./simulated-provider.ts";

const request: PaymentRequest = {
  reference: "cart-123-attempt-1",
  amountCents: 24900,
  currency: "USD",
  method: { kind: "card", token: "tok_test_visa" },
};

describe("simulated payment provider", () => {
  it("scenario 1: returns a succeeded event when the scenario is succeed", async () => {
    const provider = createSimulatedPaymentProvider({ scenario: "succeed" });

    const event = await provider.createPayment(request);

    expect(provider.id).toBe("simulated");
    expect(event.type).toBe("payment.succeeded");
    expect(event.providerRef).toBeTruthy();
  });

  it("scenario 2: returns a failed event with a reason when the scenario is fail", async () => {
    const provider = createSimulatedPaymentProvider({
      scenario: "fail",
      failureReason: "insufficient_funds",
    });

    const event = await provider.createPayment(request);

    expect(event.type).toBe("payment.failed");
    if (event.type !== "payment.failed") {
      throw new Error("expected a payment.failed event");
    }
    expect(event.reason).toBe("insufficient_funds");
    expect(event.providerRef).toBeTruthy();
  });

  it("scenario 3: returns a pending event when the scenario is pending", async () => {
    const provider = createSimulatedPaymentProvider({ scenario: "pending" });

    const event = await provider.createPayment(request);

    expect(event.type).toBe("payment.pending");
    expect(event.providerRef).toBeTruthy();
  });

  it("echoes the amount in integer cents and USD unchanged", async () => {
    const provider = createSimulatedPaymentProvider({ scenario: "succeed" });

    const event = await provider.createPayment({ ...request, amountCents: 24900 });

    expect(event.amountCents).toBe(24900);
    expect(Number.isInteger(event.amountCents)).toBe(true);
    expect(event.currency).toBe("USD");
    expect(event.reference).toBe(request.reference);
  });
});
