"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatPriceUSD } from "@/lib/money.ts";

export interface ShippingMethodData {
  id: string;
  slug: string;
  name: string;
  description: string;
  costCents: number;
  deliveryEstimate: string;
}

export interface ShippingMethodFormProps {
  shippingMethods: ShippingMethodData[];
  initialMethodId?: string | null;
  initialMethod?: ShippingMethodData | null;
  onSaved?: (method: ShippingMethodData) => void;
}

export function ShippingMethodForm({
  shippingMethods,
  initialMethodId,
  initialMethod,
  onSaved,
}: ShippingMethodFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const resolvedInitial =
    initialMethod ??
    (initialMethodId
      ? shippingMethods.find((m) => m.id === initialMethodId) ?? null
      : null);

  const [savedMethod, setSavedMethod] = useState<ShippingMethodData | null>(
    resolvedInitial,
  );
  const [isEditing, setIsEditing] = useState<boolean>(!resolvedInitial);
  const [selectedId, setSelectedId] = useState<string>(
    resolvedInitial?.id ?? shippingMethods[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleStartEdit() {
    if (savedMethod) {
      setSelectedId(savedMethod.id);
    }
    setError(null);
    setIsEditing(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) {
      setError("Please select a shipping method.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/checkout/shipping-method", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shippingMethodId: selectedId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Could not save shipping method. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const confirmedMethod: ShippingMethodData =
        data?.checkoutSession?.shippingMethod ||
        shippingMethods.find((m) => m.id === selectedId) || {
          id: selectedId,
          slug: "unknown",
          name: "Selected Method",
          description: "",
          costCents: 0,
          deliveryEstimate: "",
        };

      setSavedMethod(confirmedMethod);
      setIsEditing(false);
      setIsSubmitting(false);

      if (onSaved) {
        onSaved(confirmedMethod);
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (!isEditing && savedMethod) {
    return (
      <section
        className="checkout-step checkout-step--completed"
        data-testid="step-shipping-method"
      >
        <header className="checkout-step__header">
          <div className="checkout-step__title-wrap">
            <span className="checkout-step__badge">02</span>
            <h2 className="checkout-step__title">Shipping Method</h2>
          </div>
          <span
            className="checkout-step__status-tag"
            data-testid="shipping-step-completed"
          >
            Completed
          </span>
        </header>

        <div className="checkout-summary-card" data-testid="shipping-summary-card">
          <div className="checkout-summary-card__content">
            <div className="checkout-summary-card__group">
              <span className="checkout-summary-card__label">Selected Method</span>
              <p
                className="checkout-summary-card__text checkout-summary-card__name"
                data-testid="summary-shipping-name"
              >
                {savedMethod.name}
              </p>
              <p
                className="checkout-summary-card__text"
                data-testid="summary-shipping-estimate"
              >
                Estimated delivery: {savedMethod.deliveryEstimate}
              </p>
              <p
                className="checkout-summary-card__text"
                data-testid="summary-shipping-cost"
              >
                {savedMethod.costCents === 0
                  ? "$0.00 (Free)"
                  : formatPriceUSD(savedMethod.costCents)}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="checkout-summary-card__edit-btn"
            data-testid="edit-shipping-method"
            onClick={handleStartEdit}
          >
            Modify
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="checkout-step checkout-step--active"
      data-testid="step-shipping-method"
    >
      <header className="checkout-step__header">
        <div className="checkout-step__title-wrap">
          <span className="checkout-step__badge">02</span>
          <h2 className="checkout-step__title">Shipping Method</h2>
        </div>
        <span className="checkout-step__ready-tag" data-testid="shipping-step-ready">
          Ready for Selection
        </span>
      </header>

      <div className="checkout-step__content" data-testid="shipping-step-active-content">
        <form
          className="checkout-form"
          onSubmit={handleSubmit}
          data-testid="checkout-shipping-form"
        >
          <p className="checkout-form__hint">
            Choose your preferred delivery option for this order.
          </p>

          {error ? (
            <div className="checkout-form__alert" role="alert" data-testid="shipping-error">
              {error}
            </div>
          ) : null}

          <div
            className="checkout-shipping-options"
            role="radiogroup"
            aria-label="Available shipping methods"
            data-testid="shipping-methods-list"
          >
            {shippingMethods.map((method) => {
              const isSelected = selectedId === method.id;
              return (
                <label
                  key={method.id}
                  className={`checkout-shipping-option ${isSelected ? "checkout-shipping-option--selected" : ""}`}
                  data-testid={`shipping-option-${method.slug}`}
                >
                  <div className="checkout-shipping-option__radio-wrap">
                    <input
                      type="radio"
                      name="shippingMethodOption"
                      value={method.id}
                      checked={isSelected}
                      onChange={() => {
                        setSelectedId(method.id);
                        setError(null);
                      }}
                      className="checkout-shipping-option__radio"
                      data-testid={`radio-shipping-${method.slug}`}
                    />
                  </div>
                  <div className="checkout-shipping-option__details">
                    <div className="checkout-shipping-option__header">
                      <span
                        className="checkout-shipping-option__name"
                        data-testid={`shipping-name-${method.slug}`}
                      >
                        {method.name}
                      </span>
                      <span
                        className="checkout-shipping-option__cost"
                        data-testid={`shipping-cost-${method.slug}`}
                      >
                        {method.costCents === 0
                          ? "$0.00 (Free)"
                          : formatPriceUSD(method.costCents)}
                      </span>
                    </div>
                    <p
                      className="checkout-shipping-option__estimate"
                      data-testid={`shipping-estimate-${method.slug}`}
                    >
                      Estimated delivery: {method.deliveryEstimate}
                    </p>
                    <p className="checkout-shipping-option__description">
                      {method.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="checkout-form__actions">
            <button
              type="submit"
              className="checkout-form__submit-btn"
              disabled={isSubmitting || !selectedId}
              data-testid="checkout-submit-shipping"
            >
              {isSubmitting ? "Saving…" : "Continue to Payment"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
