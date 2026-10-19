import Link from "next/link";

import { readCartSessionToken } from "@/app/cart/session.ts";
import { getCartSummary } from "@/db/cart.ts";
import type { CartSummary } from "@/db/cart.ts";
import { getCheckoutSession, listShippingMethods } from "@/db/checkout.ts";
import type { CheckoutSessionWithShipping } from "@/db/checkout.ts";
import { getDb } from "@/db/client.ts";
import type { ShippingMethod } from "@/db/schema/index.ts";
import { formatPriceUSD } from "@/lib/money.ts";
import { calculateSalesTax } from "@/lib/tax/sales-tax.ts";

import { ContactAndAddressForm } from "./contact-and-address-form.tsx";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checkout — J. Armando",
};

export default async function CheckoutPage() {
  const sessionToken = await readCartSessionToken();

  if (!sessionToken) {
    return <EmptyCheckoutCart />;
  }

  let summary: CartSummary | undefined;
  let checkoutSession: CheckoutSessionWithShipping | undefined;
  let shippingMethods: ShippingMethod[] = [];

  try {
    const db = getDb();
    [summary, checkoutSession, shippingMethods] = await Promise.all([
      getCartSummary(db, sessionToken),
      getCheckoutSession(db, sessionToken),
      listShippingMethods(db),
    ]);
  } catch (error) {
    console.error("Failed to load checkout cart or session:", error);
    return (
      <main className="checkout-page" data-testid="checkout-page">
        <header className="checkout-page__header">
          <p className="checkout-page__eyebrow">Checkout</p>
          <h1 className="checkout-page__title">Order Checkout</h1>
        </header>
        <div className="checkout-page__state" data-testid="checkout-unavailable">
          <p className="checkout-page__state-message">
            Checkout is temporarily unavailable.
          </p>
          <Link href="/cart" className="checkout-page__state-link">
            Return to Cart
          </Link>
        </div>
      </main>
    );
  }

  if (!summary || summary.lines.length === 0) {
    return <EmptyCheckoutCart />;
  }

  const selectedShippingMethod = checkoutSession?.shippingMethod ?? null;
  const shippingCostCents = selectedShippingMethod ? selectedShippingMethod.costCents : null;
  const taxCalculation = checkoutSession?.state
    ? calculateSalesTax(summary.subtotalCents, checkoutSession.state)
    : null;
  const taxCents = taxCalculation ? taxCalculation.taxCents : 0;
  const totalCents = summary.subtotalCents + (shippingCostCents ?? 0) + taxCents;

  return (
    <main className="checkout-page" data-testid="checkout-page">
      <header className="checkout-page__header">
        <p className="checkout-page__eyebrow">Guest Checkout</p>
        <h1 className="checkout-page__title">Checkout</h1>
      </header>

      <div className="checkout-page__layout">
        <div className="checkout-page__main">
          <ContactAndAddressForm
            initialSession={checkoutSession}
            shippingMethods={shippingMethods}
          />
        </div>

        <aside className="checkout-page__sidebar" aria-label="Order summary">
          <div className="checkout-order-summary" data-testid="checkout-order-summary">
            <div className="checkout-order-summary__header">
              <h2 className="checkout-order-summary__title">Order Summary</h2>
              <Link href="/cart" className="checkout-order-summary__edit-link">
                Edit Cart
              </Link>
            </div>

            <ul className="checkout-order-summary__lines" data-testid="summary-cart-lines">
              {summary.lines.map((line) => (
                <li key={line.lineId} className="checkout-order-summary__line">
                  <div className="checkout-order-summary__line-info">
                    <p className="checkout-order-summary__line-name">{line.productName}</p>
                    <p className="checkout-order-summary__line-variant">
                      Size {line.size} · {line.color} · Qty {line.quantity}
                    </p>
                  </div>
                  <span className="checkout-order-summary__line-total">
                    {formatPriceUSD(line.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="checkout-order-summary__totals">
              <div className="checkout-order-summary__row">
                <span>Subtotal</span>
                <span data-testid="summary-subtotal">
                  {formatPriceUSD(summary.subtotalCents)}
                </span>
              </div>
              <div className="checkout-order-summary__row">
                <span>Shipping</span>
                {selectedShippingMethod ? (
                  <span data-testid="summary-shipping">
                    {formatPriceUSD(selectedShippingMethod.costCents)}
                  </span>
                ) : (
                  <span
                    className="checkout-order-summary__hint"
                    data-testid="summary-shipping-hint"
                  >
                    Calculated next step
                  </span>
                )}
              </div>
              <div className="checkout-order-summary__row">
                <span>Estimated Tax</span>
                {taxCalculation !== null ? (
                  <span data-testid="summary-tax">
                    {formatPriceUSD(taxCalculation.taxCents)}
                  </span>
                ) : (
                  <span
                    className="checkout-order-summary__hint"
                    data-testid="summary-tax-hint"
                  >
                    Calculated from address
                  </span>
                )}
              </div>
              <div className="checkout-order-summary__row checkout-order-summary__row--total">
                <span>Total</span>
                <span data-testid="summary-total">
                  {formatPriceUSD(totalCents)}
                </span>
              </div>
            </div>

            <p className="checkout-order-summary__note">
              Prices in USD (tax-exclusive). Sales tax is calculated from your shipping address.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function EmptyCheckoutCart() {
  return (
    <main className="checkout-page" data-testid="checkout-page">
      <header className="checkout-page__header">
        <p className="checkout-page__eyebrow">Checkout</p>
        <h1 className="checkout-page__title">Your Cart is Empty</h1>
      </header>
      <div className="checkout-page__state" data-testid="checkout-empty">
        <p className="checkout-page__state-message">
          You need items in your cart before proceeding to checkout.
        </p>
        <div className="checkout-page__state-links">
          <Link href="/catalog" className="checkout-page__state-link">
            Continue Shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
