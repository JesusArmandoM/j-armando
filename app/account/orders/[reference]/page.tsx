import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { getOrderByReferenceForAccount } from "@/db/order.ts";
import type { OrderWithDetails } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: OrderDetailPageProps) {
  const { reference } = await params;
  return {
    title: `Order ${reference} — J. Armando`,
  };
}

function formatOrderDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { reference } = await params;

  const sessionToken = await getAccountSessionToken();
  if (!sessionToken) {
    redirect(`/account/signin?returnUrl=/account/orders/${encodeURIComponent(reference)}`);
  }

  let authData: Awaited<ReturnType<typeof getAccountFromSessionToken>> | null = null;
  try {
    const db = getDb();
    authData = await getAccountFromSessionToken(db, sessionToken);
  } catch (error) {
    console.error("Failed to load account data:", error);
  }

  if (!authData) {
    redirect(`/account/signin?returnUrl=/account/orders/${encodeURIComponent(reference)}`);
  }

  let order: OrderWithDetails | null = null;
  try {
    const db = getDb();
    order = await getOrderByReferenceForAccount(db, reference, authData.account.id);
  } catch (error) {
    console.error("Failed to load order detail:", error);
  }

  if (!order) {
    notFound();
    return null;
  }

  const statusLabel =
    order.status.charAt(0).toUpperCase() + order.status.slice(1);
  const fulfillmentLabel = order.fulfillmentStatus
    ? order.fulfillmentStatus.charAt(0).toUpperCase() +
      order.fulfillmentStatus.slice(1)
    : "Unfulfilled";

  return (
    <main
      className="order-confirmation-page order-detail-page"
      data-testid="order-detail-page"
    >
      <header className="order-confirmation__header">
        <nav className="order-detail__breadcrumb" style={{ marginBottom: "1rem" }}>
          <Link
            href="/account/orders"
            className="account-page__link"
            data-testid="back-to-orders"
          >
            ← Back to Order History
          </Link>
        </nav>

        <div className="order-confirmation__status-row">
          <p className="order-confirmation__eyebrow">Customer Account · Order</p>
          <div className="order-confirmation__badges">
            <span
              className="order-confirmation__badge order-confirmation__badge--status"
              data-testid="order-status"
            >
              Status: {statusLabel}
            </span>
            <span
              className="order-confirmation__badge order-confirmation__badge--fulfillment"
              data-testid="order-fulfillment-status"
            >
              Fulfillment: {fulfillmentLabel}
            </span>
          </div>
        </div>

        <h1 className="order-confirmation__title" data-testid="order-reference">
          {order.reference}
        </h1>
        <p
          className="order-confirmation__reference-line"
          data-testid="order-date"
        >
          Placed on {formatOrderDate(order.createdAt)}
        </p>

        <p className="order-confirmation__notice" data-testid="order-contact-email">
          Order associated with <strong>{order.contactEmail}</strong>.
        </p>
      </header>

      <div className="order-confirmation__layout">
        <div className="order-confirmation__main">
          {/* Purchased Line Items */}
          <section
            className="order-confirmation__section"
            data-testid="order-lines-section"
          >
            <h2 className="order-confirmation__section-title">Items Ordered</h2>
            <ul className="order-confirmation__lines" data-testid="order-lines">
              {order.lines.map((line) => (
                <li
                  key={line.id}
                  className="order-confirmation__line"
                  data-testid="order-line-item"
                >
                  <div className="order-confirmation__line-details">
                    <p
                      className="order-confirmation__line-name"
                      data-testid="order-line-name"
                    >
                      {line.productName}
                    </p>
                    <p
                      className="order-confirmation__line-variant"
                      data-testid="order-line-variant"
                    >
                      Size {line.variantSize} · {line.variantColor}
                    </p>
                    <p className="order-confirmation__line-meta">
                      <span data-testid="order-line-qty">Qty: {line.quantity}</span>
                      {" · "}
                      <span data-testid="order-line-unit-price">
                        {formatPriceUSD(line.unitPriceCents)} each
                      </span>
                    </p>
                  </div>
                  <span
                    className="order-confirmation__line-total"
                    data-testid="order-line-total"
                  >
                    {formatPriceUSD(line.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Shipping Details */}
          <section
            className="order-confirmation__section"
            data-testid="order-shipping-section"
          >
            <h2 className="order-confirmation__section-title">Delivery Details</h2>
            <div className="order-confirmation__delivery-grid">
              <div
                className="order-confirmation__card"
                data-testid="order-shipping-address"
              >
                <h3 className="order-confirmation__card-label">Shipping Address</h3>
                <p className="order-confirmation__card-name">
                  {order.shippingAddress.recipientName}
                </p>
                <p className="order-confirmation__card-line">
                  {order.shippingAddress.line1}
                </p>
                {order.shippingAddress.line2 ? (
                  <p className="order-confirmation__card-line">
                    {order.shippingAddress.line2}
                  </p>
                ) : null}
                <p className="order-confirmation__card-line">
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.zip}
                </p>
                <p className="order-confirmation__card-line">
                  {order.shippingAddress.country}
                </p>
                {order.shippingAddress.phone ? (
                  <p className="order-confirmation__card-phone">
                    Phone: {order.shippingAddress.phone}
                  </p>
                ) : null}
              </div>

              <div
                className="order-confirmation__card"
                data-testid="order-shipping-method"
              >
                <h3 className="order-confirmation__card-label">Shipping Method</h3>
                <p className="order-confirmation__card-name">
                  {order.shippingMethod.name}
                </p>
                <p className="order-confirmation__card-desc">
                  Estimated delivery: {order.shippingMethod.deliveryEstimate}
                </p>
                <p className="order-confirmation__card-cost">
                  {order.shippingMethod.costCents === 0
                    ? "Free"
                    : formatPriceUSD(order.shippingMethod.costCents)}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Order Totals Summary */}
        <aside
          className="order-confirmation__sidebar"
          aria-label="Order financial summary"
        >
          <div
            className="order-confirmation-summary"
            data-testid="order-totals-summary"
          >
            <h2 className="order-confirmation-summary__title">Summary</h2>

            <div className="order-confirmation-summary__totals">
              <div className="order-confirmation-summary__row">
                <span>Subtotal</span>
                <span data-testid="order-subtotal">
                  {formatPriceUSD(order.subtotalCents)}
                </span>
              </div>
              <div className="order-confirmation-summary__row">
                <span>Shipping</span>
                <span data-testid="order-shipping">
                  {order.shippingCents === 0
                    ? "Free"
                    : formatPriceUSD(order.shippingCents)}
                </span>
              </div>
              <div className="order-confirmation-summary__row">
                <span>Estimated Tax</span>
                <span data-testid="order-tax">
                  {formatPriceUSD(order.taxCents)}
                </span>
              </div>
              <div className="order-confirmation-summary__row order-confirmation-summary__row--total">
                <span>Total (USD)</span>
                <span data-testid="order-total">
                  {formatPriceUSD(order.totalCents)}
                </span>
              </div>
            </div>

            <p className="order-confirmation-summary__note">
              Order totals match frozen values recorded at purchase time.
            </p>

            <div className="order-confirmation-summary__actions">
              <Link
                href="/account/orders"
                className="order-confirmation__continue-btn"
                data-testid="back-orders-btn"
              >
                Back to Order History
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
