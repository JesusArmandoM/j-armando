import Link from "next/link";

import { getCartSummary } from "@/db/cart.ts";
import type { CartSummary } from "@/db/cart.ts";
import { getDb } from "@/db/client.ts";
import { formatPriceUSD } from "@/lib/money.ts";

import { CartLineRow } from "./cart-line-row.tsx";
import { readCartSessionToken } from "./session.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your Cart — J. Armando",
};

/**
 * Session-scoped guest cart. Reading the cookie (and the cart) never creates a
 * cart or mints a cookie; only `POST /api/cart/lines` does that. This slice is
 * read-only: no quantity editing, removal or checkout controls.
 */
export default async function CartPage() {
  const sessionToken = await readCartSessionToken();

  // No cookie means no cart yet: render the empty state without a DB call.
  if (sessionToken === undefined) {
    return <EmptyCart />;
  }

  let summary: CartSummary | undefined;
  try {
    summary = await getCartSummary(getDb(), sessionToken);
  } catch (error) {
    console.error("Failed to load the guest cart:", error);
    return (
      <main className="cart" data-testid="cart-page">
        <header className="cart__header">
          <p className="cart__eyebrow">Guest cart</p>
          <h1 className="cart__title">Your Cart</h1>
        </header>
        <div className="cart__state" data-testid="cart-unavailable">
          <p className="cart__state-message">Your cart is temporarily unavailable.</p>
          <Link href="/catalog" className="cart__state-link">
            Browse the collection
          </Link>
        </div>
      </main>
    );
  }

  if (summary === undefined || summary.lines.length === 0) {
    return <EmptyCart notifications={summary?.notifications} />;
  }

  return (
    <main className="cart" data-testid="cart-page">
      <header className="cart__header">
        <p className="cart__eyebrow">Guest cart</p>
        <h1 className="cart__title">Your Cart</h1>
      </header>

      {summary.notifications && summary.notifications.length > 0 ? (
        <div className="cart__notifications" data-testid="cart-notifications">
          {summary.notifications.map((msg, idx) => (
            <p key={idx} className="cart__notification" role="status">
              {msg}
            </p>
          ))}
        </div>
      ) : null}

      <section className="cart__lines" aria-label="Cart items" data-testid="cart-lines">
        <ul className="cart__list">
          {summary.lines.map((line) => (
            <CartLineRow key={line.lineId} line={line} />
          ))}
        </ul>
      </section>

      <div className="cart__subtotal" data-testid="cart-subtotal">
        <span className="cart__subtotal-label">Subtotal</span>
        <span className="cart__subtotal-amount">
          {formatPriceUSD(summary.subtotalCents)}
        </span>
      </div>

      <p className="cart__note">
        USD, tax-exclusive. Taxes and shipping calculated at checkout.
      </p>
    </main>
  );
}

function EmptyCart({ notifications }: { notifications?: string[] }) {
  return (
    <main className="cart" data-testid="cart-page">
      <header className="cart__header">
        <p className="cart__eyebrow">Guest cart</p>
        <h1 className="cart__title">Your Cart</h1>
      </header>
      {notifications && notifications.length > 0 ? (
        <div className="cart__notifications" data-testid="cart-notifications">
          {notifications.map((msg, idx) => (
            <p key={idx} className="cart__notification" role="status">
              {msg}
            </p>
          ))}
        </div>
      ) : null}
      <div className="cart__state" data-testid="cart-empty">
        <p className="cart__state-message">Your cart is empty.</p>
        <Link href="/catalog" className="cart__state-link">
          Continue shopping
        </Link>
      </div>
    </main>
  );
}
