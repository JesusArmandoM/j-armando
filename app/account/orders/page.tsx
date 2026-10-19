import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { listOrdersForAccount } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order History — J. Armando",
};

function formatOrderDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function OrderHistoryPage() {
  const sessionToken = await getAccountSessionToken();
  if (!sessionToken) {
    redirect("/account/signin?returnUrl=/account/orders");
  }

  let authData: Awaited<ReturnType<typeof getAccountFromSessionToken>> | null = null;
  try {
    const db = getDb();
    authData = await getAccountFromSessionToken(db, sessionToken);
  } catch (error) {
    console.error("Failed to load account data:", error);
  }

  if (!authData) {
    redirect("/account/signin?returnUrl=/account/orders");
  }

  let orders: Awaited<ReturnType<typeof listOrdersForAccount>> = [];
  try {
    const db = getDb();
    orders = await listOrdersForAccount(db, authData.account.id);
  } catch (error) {
    console.error("Failed to load orders for account:", error);
  }

  return (
    <main className="account-page orders-page" data-testid="orders-page">
      <header className="account-page__header">
        <p className="account-page__eyebrow">Customer Account</p>
        <h1 className="account-page__title">Order History</h1>
        <p className="account-page__lede">
          View and track your previous orders.
        </p>
      </header>

      {orders.length === 0 ? (
        <section className="account-card orders-empty" data-testid="orders-empty">
          <p className="orders-empty__message">You haven&apos;t placed any orders yet.</p>
          <div className="orders-empty__actions">
            <Link
              href="/catalog"
              className="auth-btn auth-btn--primary"
              data-testid="browse-catalog-link"
            >
              Browse Collection
            </Link>
          </div>
        </section>
      ) : (
        <section className="orders-list" data-testid="orders-list">
          {orders.map((item) => {
            const statusLabel =
              item.status.charAt(0).toUpperCase() + item.status.slice(1);
            const fulfillmentLabel = item.fulfillmentStatus
              ? item.fulfillmentStatus.charAt(0).toUpperCase() +
                item.fulfillmentStatus.slice(1)
              : "Unfulfilled";

            return (
              <article
                key={item.id}
                className="order-history-card"
                data-testid="order-list-item"
              >
                <div className="order-history-card__header">
                  <div className="order-history-card__ref-group">
                    <Link
                      href={`/account/orders/${item.reference}`}
                      className="order-history-card__reference"
                      data-testid="order-reference"
                    >
                      {item.reference}
                    </Link>
                    <time
                      className="order-history-card__date"
                      data-testid="order-date"
                    >
                      {formatOrderDate(item.createdAt)}
                    </time>
                  </div>

                  <div className="order-history-card__badges">
                    <span
                      className="order-confirmation__badge order-confirmation__badge--status"
                      data-testid="order-status"
                    >
                      Status: {statusLabel}
                    </span>
                    <span
                      className="order-confirmation__badge order-confirmation__badge--fulfillment"
                      data-testid="order-fulfillment"
                    >
                      Fulfillment: {fulfillmentLabel}
                    </span>
                  </div>
                </div>

                <div className="order-history-card__body">
                  <div className="order-history-card__summary">
                    <p
                      className="order-history-card__items-count"
                      data-testid="order-items-count"
                    >
                      {item.itemCount} {item.itemCount === 1 ? "item" : "items"}
                    </p>
                    <p className="order-history-card__lines-preview">
                      {item.lines
                        .map(
                          (line) =>
                            `${line.productName} (${line.variantColor}, ${line.variantSize}) x${line.quantity}`,
                        )
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="order-history-card__total-col">
                    <span className="order-history-card__total-label">Total</span>
                    <strong
                      className="order-history-card__total"
                      data-testid="order-total"
                    >
                      {formatPriceUSD(item.totalCents)}
                    </strong>
                  </div>
                </div>

                <div className="order-history-card__footer">
                  <Link
                    href={`/account/orders/${item.reference}`}
                    className="order-history-card__details-link"
                    data-testid="order-details-link"
                  >
                    View Details →
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <div className="account-page__links">
        <Link
          href="/account"
          className="account-page__link"
          data-testid="account-overview-link"
        >
          Account Overview
        </Link>
        <span className="account-page__link-separator">/</span>
        <Link href="/catalog" className="account-page__link">
          Browse Collection
        </Link>
        <span className="account-page__link-separator">/</span>
        <Link href="/cart" className="account-page__link">
          View Cart
        </Link>
      </div>
    </main>
  );
}
