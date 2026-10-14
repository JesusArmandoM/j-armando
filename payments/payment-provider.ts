// Payment port (framework-agnostic). This module MUST NOT import Next.js,
// React, the database layer or any network code: store code (checkout, order
// flows, UI) depends only on these types, so a real card gateway can be
// substituted behind `PaymentProvider` later without touching store code.
//
// A real card gateway confirms payments asynchronously, so the outcome is a
// discriminated event and `pending` is a first-class result, never a boolean.

export type PaymentOutcome = "succeeded" | "failed" | "pending";

export type PaymentFailureReason =
  | "card_declined"
  | "insufficient_funds"
  | "provider_error";

export interface PaymentRequest {
  /** Opaque caller reference for this attempt (e.g. a cart/checkout reference). */
  reference: string;
  /** Integer number of cents in the request currency. Never a float. */
  amountCents: number;
  currency: "USD";
  /**
   * Opaque payment method token. Never a raw card number, CVV or expiry —
   * the store never sees card data (no PCI scope; see docs/mvp-scope.md).
   */
  method: { kind: "card"; token: string };
}

interface PaymentEventBase {
  /** Stable, opaque provider reference. the shopper never sees provider internals. */
  providerRef: string;
  reference: string;
  amountCents: number;
  currency: "USD";
}

export interface PaymentSucceededEvent extends PaymentEventBase {
  type: "payment.succeeded";
}

export interface PaymentFailedEvent extends PaymentEventBase {
  type: "payment.failed";
  reason: PaymentFailureReason;
}

/**
 * The provider could not confirm the payment synchronously. Async confirmation
 * is represented by `pending` plus the stable `providerRef`; a future gateway
 * can add a reconciliation/webhook path behind the same event shape.
 */
export interface PaymentPendingEvent extends PaymentEventBase {
  type: "payment.pending";
}

export type PaymentEvent =
  | PaymentSucceededEvent
  | PaymentFailedEvent
  | PaymentPendingEvent;

export interface PaymentProvider {
  readonly id: string;
  /** Single narrow initiation method. Returns the resulting payment event. */
  createPayment(request: PaymentRequest): Promise<PaymentEvent>;
}
