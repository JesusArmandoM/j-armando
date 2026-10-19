import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client.ts";
import { getOrderByReference } from "@/db/order.ts";
import type { OrderWithDetails } from "@/db/order.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

interface OrderConfirmationPageProps {
  params: Promise<{ reference: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: OrderConfirmationPageProps) {
  const { reference } = await params;
  return {
    title: `Order ${reference} Confirmed — J. Armando`,
  };
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderConfirmationPageProps) {
  const { reference } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryNewAccount = Array.isArray(resolvedSearchParams.new_account)
    ? resolvedSearchParams.new_account[0]
    : resolvedSearchParams.new_account;
  const queryAccount = Array.isArray(resolvedSearchParams.account)
    ? resolvedSearchParams.account[0]
    : resolvedSearchParams.account;

  let order: OrderWithDetails | undefined;
  try {
    order = await getOrderByReference(getDb(), reference);
  } catch (error) {
    console.error("Failed to load order confirmation:", error);
  }

  if (!order) {
    notFound();
    return null;
  }

  const isLinked =
    queryNewAccount === "false" ||
    queryAccount === "linked" ||
    order.isNewAccount === false;

  const accountNoticeMessage = isLinked
    ? `Order linked to your account ${order.contactEmail}.`
    : `We've created an account for your order at ${order.contactEmail}.`;

  const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
  const fulfillmentLabel = order.fulfillmentStatus
    ? order.fulfillmentStatus.charAt(0).toUpperCase() + order.fulfillmentStatus.slice(1)
    : "Unfulfilled";

  return (
    <main className="order-confirmation-page" data-testid="order-confirmation-page">
      <header className="order-confirmation__header">
        <div className="order-confirmation__status-row">
          <p className="order-confirmation__eyebrow">Order Confirmed</p>
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

        <h1 className="order-confirmation__title">Thank you for your order!</h1>
        <p className="order-confirmation__reference-line">
          Order reference:{" "}
          <strong className="order-confirmation__reference" data-testid="order-reference">
            {order.reference}
          </strong>
        </p>

        <p className="order-confirmation__notice" data-testid="confirmation-notice">
          A confirmation email has been sent to <strong>{order.contactEmail}</strong>.
        </p>

        <p className="order-confirmation__account-notice" data-testid="account-notice">
          {accountNoticeMessage}
        </p>

        {order.hasPassword ? (
          <p className="order-confirmation__password-notice" data-testid="password-notice">
            Quick Access password active. You can sign in anytime using your email and password.
          </p>
        ) : null}
      </header>

      <div className="order-confirmation__layout">
        <div className="order-confirmation__main">
          {/* Purchased Line Items */}
          <section className="order-confirmation__section" data-testid="order-lines-section">
            <h2 className="order-confirmation__section-title">Items Ordered</h2>
            <ul className="order-confirmation__lines" data-testid="order-lines">
              {order.lines.map((line) => (
                <li
                  key={line.id}
                  className="order-confirmation__line"
                  data-testid="order-line-item"
                >
                  <div className="order-confirmation__line-details">
                    <p className="order-confirmation__line-name" data-testid="order-line-name">
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
                <p className="order-confirmation__card-line">{order.shippingAddress.line1}</p>
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
                  {order.shippingCents === 0 ? "Free" : formatPriceUSD(order.shippingCents)}
                </span>
              </div>
              <div className="order-confirmation-summary__row">
                <span>Sales Tax</span>
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
              Payment confirmed via simulated provider. Prices in USD.
            </p>

            <div className="order-confirmation-summary__actions">
              <Link
                href="/catalog"
                className="order-confirmation__continue-btn"
                data-testid="continue-shopping-link"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
