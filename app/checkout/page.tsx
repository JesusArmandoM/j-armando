import Link from "next/link";

import { readCartSessionToken } from "@/app/cart/session.ts";
import { getCartSummary } from "@/db/cart.ts";
import type { CartSummary } from "@/db/cart.ts";
import { getCheckoutSession } from "@/db/checkout.ts";
import { getDb } from "@/db/client.ts";
import { formatPriceUSD } from "@/lib/money.ts";

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
  let checkoutSession;

  try {
    const db = getDb();
    [summary, checkoutSession] = await Promise.all([
      getCartSummary(db, sessionToken),
      getCheckoutSession(db, sessionToken),
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

  return (
    <main className="checkout-page" data-testid="checkout-page">
      <header className="checkout-page__header">
        <p className="checkout-page__eyebrow">Guest Checkout</p>
        <h1 className="checkout-page__title">Checkout</h1>
      </header>

      <div className="checkout-page__layout">
        <div className="checkout-page__main">
          <ContactAndAddressForm initialSession={checkoutSession} />
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
                <span className="checkout-order-summary__hint">Calculated next step</span>
              </div>
              <div className="checkout-order-summary__row">
                <span>Sales Tax</span>
                <span className="checkout-order-summary__hint">Calculated from address</span>
              </div>
            </div>

            <p className="checkout-order-summary__note">
              Prices in USD. Sales tax is added based on the delivery destination.
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
