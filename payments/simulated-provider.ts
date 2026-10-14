// Simulated PaymentProvider adapter. Deterministic, in-process, no network, no
// timers and no database. It exists so the store can be built and tested
// against every outcome the MVP requires (succeeded, failed, pending) before a
// real gateway is dropped in behind the same `PaymentProvider` interface.

import type {
  PaymentEvent,
  PaymentFailureReason,
  PaymentProvider,
  PaymentRequest,
} from "./payment-provider.ts";

export type PaymentScenario = "succeed" | "fail" | "pending";

export interface SimulatedProviderOptions {
  /**
   * Which outcome to return. A fixed scenario makes the provider deterministic;
   * a function (sync or async) lets a caller drive per-request scenarios.
   * Defaults to "succeed".
   */
  scenario?:
    | PaymentScenario
    | ((request: PaymentRequest) => PaymentScenario | Promise<PaymentScenario>);
  /** Reason attached to a failed event. Defaults to "card_declined". */
  failureReason?: PaymentFailureReason;
}

const PROVIDER_ID = "simulated";

export function createSimulatedPaymentProvider(
  options: SimulatedProviderOptions = {},
): PaymentProvider {
  const { scenario = "succeed", failureReason = "card_declined" } = options;

  return {
    id: PROVIDER_ID,
    async createPayment(request: PaymentRequest): Promise<PaymentEvent> {
      const resolvedScenario =
        typeof scenario === "function" ? await scenario(request) : scenario;

      const base = {
        providerRef: `sim_${request.reference}`,
        reference: request.reference,
        amountCents: request.amountCents,
        currency: request.currency,
      } as const;

      switch (resolvedScenario) {
        case "succeed":
          return { type: "payment.succeeded", ...base };
        case "fail":
          return { type: "payment.failed", reason: failureReason, ...base };
        case "pending":
          return { type: "payment.pending", ...base };
      }
    },
  };
}
