import type { PaymentOutcomeView } from "@/payments/payment-outcome.ts";

interface PaymentOutcomeNoticeProps {
  view: PaymentOutcomeView;
}

/**
 * Presentational outcome surface for the checkout payment step. It stays a
 * Server Component: no state, no handlers, no browser APIs. The future
 * checkout feature renders it with a `PaymentOutcomeView` and attaches any
 * interactive retry behaviour (`retryable` is surfaced here as a hint only).
 *
 * Meaning is conveyed by a distinct heading, message and `data-outcome` value,
 * never by colour alone.
 */
export function PaymentOutcomeNotice({ view }: PaymentOutcomeNoticeProps) {
  return (
    <section
      className={`payment-outcome payment-outcome--${view.outcome}`}
      data-testid="payment-outcome"
      data-outcome={view.outcome}
      aria-live="polite"
    >
      <h2 className="payment-outcome__title">{view.title}</h2>
      <p
        className="payment-outcome__amount"
        data-testid="payment-outcome-amount"
      >
        {view.amountLabel}
      </p>
      <p className="payment-outcome__message">{view.message}</p>
      {view.retryable ? (
        <p className="payment-outcome__retry" data-testid="payment-outcome-retry">
          You can retry the payment when you&rsquo;re ready.
        </p>
      ) : null}
    </section>
  );
}
