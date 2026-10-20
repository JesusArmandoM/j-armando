"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getNextFulfillmentStatus } from "@/db/admin-orders.ts";
import type { FulfillmentStatus, OrderStatus } from "@/db/schema/index.ts";

interface FulfillmentControlsProps {
  reference: string;
  initialFulfillmentStatus: FulfillmentStatus | null;
  paymentStatus: OrderStatus;
}

const STAGES: { key: FulfillmentStatus; label: string }[] = [
  { key: "unfulfilled", label: "Unfulfilled" },
  { key: "preparing", label: "Preparing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

function getStageIndex(status: FulfillmentStatus): number {
  return STAGES.findIndex((s) => s.key === status);
}

function getNextActionLabel(nextStatus: FulfillmentStatus): string {
  switch (nextStatus) {
    case "preparing":
      return "Mark as Preparing";
    case "shipped":
      return "Mark as Shipped";
    case "delivered":
      return "Mark as Delivered";
    default:
      return `Advance to ${nextStatus}`;
  }
}

export function FulfillmentControls({
  reference,
  initialFulfillmentStatus,
  paymentStatus,
}: FulfillmentControlsProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<FulfillmentStatus>(
    initialFulfillmentStatus ?? "unfulfilled",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentIndex = getStageIndex(currentStatus);
  const isPaid = paymentStatus === "paid";
  const nextStatus = isPaid ? getNextFulfillmentStatus(currentStatus) : null;
  const isDelivered = currentStatus === "delivered";

  async function handleAdvance() {
    if (!nextStatus || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(reference)}/fulfillment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fulfillmentStatus: nextStatus }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to update fulfillment status.");
        return;
      }

      setCurrentStatus(nextStatus);
      setSuccess(`Fulfillment status updated to ${nextStatus}.`);
      router.refresh();
    } catch (err) {
      console.error("Fulfillment update network error:", err);
      setError("A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="admin-orders-section admin-order-fulfillment-section"
      data-testid="admin-order-fulfillment-section"
      aria-label="Order Fulfillment Lifecycle"
    >
      <h2 className="admin-orders-section__title">Fulfillment Progress</h2>

      <div
        className="admin-order-fulfillment-card"
        data-testid="admin-fulfillment-stage-indicator"
      >
        <ol className="admin-order-fulfillment-timeline">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const stateClass = isCurrent
              ? "admin-order-fulfillment-step--active"
              : isCompleted
                ? "admin-order-fulfillment-step--completed"
                : "admin-order-fulfillment-step--pending";

            return (
              <li
                key={stage.key}
                className={`admin-order-fulfillment-step ${stateClass}`}
                data-testid={`admin-fulfillment-step-${stage.key}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="admin-order-fulfillment-step__marker">
                  {isCompleted ? "✓" : idx + 1}
                </div>
                <span className="admin-order-fulfillment-step__label">
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>

        {!isPaid ? (
          <div
            className="admin-order-fulfillment-notice"
            data-testid="admin-fulfillment-unpaid-notice"
          >
            <p>
              Order payment status is <strong>{paymentStatus}</strong>. Fulfillment can only begin once payment has succeeded.
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            className="admin-order-fulfillment-alert admin-order-fulfillment-alert--error"
            data-testid="admin-fulfillment-error"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            className="admin-order-fulfillment-alert admin-order-fulfillment-alert--success"
            data-testid="admin-fulfillment-success"
            role="status"
          >
            {success}
          </div>
        ) : null}

        {isPaid && nextStatus ? (
          <div className="admin-order-fulfillment-actions">
            <button
              type="button"
              className="admin-order-fulfillment-btn"
              data-testid="admin-fulfillment-advance-btn"
              disabled={isSubmitting}
              onClick={handleAdvance}
            >
              {isSubmitting ? "Updating..." : getNextActionLabel(nextStatus)}
            </button>
            <p className="admin-order-fulfillment-help">
              Advances order from <em>{currentStatus}</em> to <em>{nextStatus}</em>.
            </p>
          </div>
        ) : null}

        {isDelivered ? (
          <div
            className="admin-order-fulfillment-complete"
            data-testid="admin-fulfillment-complete-message"
          >
            <p>
              ✓ Order has been delivered. Fulfillment is complete.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
