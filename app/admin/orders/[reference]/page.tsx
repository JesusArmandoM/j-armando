import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getOrderForAdmin } from "@/db/admin-orders.ts";
import type { AdminOrderDetail } from "@/db/admin-orders.ts";
import { getDb } from "@/db/client.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

interface AdminOrderDetailPageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: AdminOrderDetailPageProps) {
  const { reference } = await params;
  return {
    title: `Order ${reference} — J. Armando Backoffice`,
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

function formatStatusLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const { reference } = await params;

  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect(`/account/signin?returnUrl=/admin/orders/${encodeURIComponent(reference)}`);
  }

  if (sessionResult.status === "forbidden") {
    return (
      <div className="admin-orders-forbidden" data-testid="admin-forbidden">
        <p>Access Denied: You do not have permission to view the backoffice.</p>
      </div>
    );
  }

  let order: AdminOrderDetail | null = null;
  try {
    const db = getDb();
    order = await getOrderForAdmin(db, reference);
  } catch (error) {
    console.error("Failed to load admin order detail:", error);
  }

  if (!order) {
    notFound();
    return null;
  }

  const fulfillmentRaw = order.fulfillmentStatus ?? "unfulfilled";

  return (
    <div className="admin-orders-detail" data-testid="admin-order-detail-page">
      <nav className="admin-orders-detail__nav" aria-label="Order breadcrumb">
        <Link
          href="/admin/orders"
          className="admin-orders-back-link"
          data-testid="back-to-admin-orders"
        >
          &larr; Back to All Orders
        </Link>
      </nav>

      <header className="admin-orders-detail__header">
        <div className="admin-orders-detail__meta-row">
          <p className="admin-orders-detail__eyebrow">Backoffice &middot; Order Record</p>
          <div className="admin-orders-detail__badges">
            <span
              className={`admin-orders-badge admin-orders-badge--status admin-orders-badge--${order.status}`}
              data-testid="admin-order-detail-status"
            >
              Payment: {formatStatusLabel(order.status)}
            </span>
            <span
              className={`admin-orders-badge admin-orders-badge--fulfillment admin-orders-badge--${fulfillmentRaw}`}
              data-testid="admin-order-detail-fulfillment"
            >
              Fulfillment: {formatStatusLabel(fulfillmentRaw)}
            </span>
          </div>
        </div>

        <h1
          className="admin-orders-detail__title"
          data-testid="admin-order-detail-reference"
        >
          {order.reference}
        </h1>

        <p
          className="admin-orders-detail__date"
          data-testid="admin-order-detail-date"
        >
          Placed on {formatOrderDate(order.createdAt)}
        </p>

        <p
          className="admin-orders-detail__customer"
          data-testid="admin-order-detail-email"
        >
          Customer Email: <strong>{order.contactEmail}</strong>
        </p>
      </header>

      <div className="admin-orders-detail__grid">
        <div className="admin-orders-detail__main">
          <section
            className="admin-orders-section"
            data-testid="admin-order-lines-section"
          >
            <h2 className="admin-orders-section__title">Frozen Order Lines</h2>
            <ul className="admin-orders-lines" data-testid="admin-order-lines">
              {order.lines.map((line) => (
                <li
                  key={line.id}
                  className="admin-orders-line"
                  data-testid="admin-order-line"
                >
                  <div className="admin-orders-line__info">
                    <p
                      className="admin-orders-line__name"
                      data-testid="admin-order-line-name"
                    >
                      {line.productName}
                    </p>
                    <p
                      className="admin-orders-line__variant"
                      data-testid="admin-order-line-variant"
                    >
                      Size {line.variantSize} &middot; {line.variantColor}
                    </p>
                    <p className="admin-orders-line__meta">
                      <span data-testid="admin-order-line-qty">
                        Qty: {line.quantity}
                      </span>
                      {" · "}
                      <span data-testid="admin-order-line-unit-price">
                        {formatPriceUSD(line.unitPriceCents)} each
                      </span>
                    </p>
                  </div>
                  <strong
                    className="admin-orders-line__total"
                    data-testid="admin-order-line-total"
                  >
                    {formatPriceUSD(line.lineTotalCents)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="admin-orders-section"
            data-testid="admin-order-delivery-section"
          >
            <h2 className="admin-orders-section__title">Delivery Snapshot</h2>
            <div className="admin-orders-delivery-cards">
              <div
                className="admin-orders-card"
                data-testid="admin-order-shipping-address"
              >
                <h3 className="admin-orders-card__label">Shipping Address</h3>
                <p className="admin-orders-card__name">
                  {order.shippingAddress.recipientName}
                </p>
                <p className="admin-orders-card__line">
                  {order.shippingAddress.line1}
                </p>
                {order.shippingAddress.line2 ? (
                  <p className="admin-orders-card__line">
                    {order.shippingAddress.line2}
                  </p>
                ) : null}
                <p className="admin-orders-card__line">
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.zip}
                </p>
                <p className="admin-orders-card__line">
                  {order.shippingAddress.country}
                </p>
                {order.shippingAddress.phone ? (
                  <p className="admin-orders-card__phone">
                    Phone: {order.shippingAddress.phone}
                  </p>
                ) : null}
              </div>

              <div
                className="admin-orders-card"
                data-testid="admin-order-shipping-method"
              >
                <h3 className="admin-orders-card__label">Shipping Method</h3>
                <p className="admin-orders-card__name">
                  {order.shippingMethod.name}
                </p>
                <p className="admin-orders-card__line">
                  Estimated delivery: {order.shippingMethod.deliveryEstimate}
                </p>
                <p className="admin-orders-card__cost">
                  {order.shippingMethod.costCents === 0
                    ? "Free"
                    : formatPriceUSD(order.shippingMethod.costCents)}
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside
          className="admin-orders-detail__sidebar"
          aria-label="Order financial summary"
        >
          <div
            className="admin-orders-summary"
            data-testid="admin-order-financial-summary"
          >
            <h2 className="admin-orders-summary__title">Financial Summary</h2>
            <div className="admin-orders-summary__rows">
              <div className="admin-orders-summary__row">
                <span>Subtotal</span>
                <span data-testid="admin-order-subtotal">
                  {formatPriceUSD(order.subtotalCents)}
                </span>
              </div>
              <div className="admin-orders-summary__row">
                <span>Shipping</span>
                <span data-testid="admin-order-shipping">
                  {order.shippingCents === 0
                    ? "Free"
                    : formatPriceUSD(order.shippingCents)}
                </span>
              </div>
              <div className="admin-orders-summary__row">
                <span>Estimated Tax</span>
                <span data-testid="admin-order-tax">
                  {formatPriceUSD(order.taxCents)}
                </span>
              </div>
              <div className="admin-orders-summary__row admin-orders-summary__row--total">
                <span>Total (USD)</span>
                <span data-testid="admin-order-total">
                  {formatPriceUSD(order.totalCents)}
                </span>
              </div>
            </div>
            <p className="admin-orders-summary__note">
              Read-only snapshot. Prices and tax were frozen in USD integer cents at
              purchase time.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
