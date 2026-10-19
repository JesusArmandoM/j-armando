"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatPriceUSD } from "@/lib/money.ts";
import { calculateSalesTax } from "@/lib/tax/sales-tax.ts";
import {
  parseCheckoutContactAndAddress,
  US_STATES,
} from "./checkout-input.ts";
import type { CheckoutInputErrors } from "./checkout-input.ts";
import { ShippingMethodForm } from "./shipping-method-form.tsx";
import type { ShippingMethodData } from "./shipping-method-form.tsx";

export interface CheckoutSessionData {
  id: string;
  email: string;
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string | null;
  shippingMethodId?: string | null;
  shippingMethod?: ShippingMethodData | null;
}

const DEFAULT_SHIPPING_METHODS: ShippingMethodData[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    slug: "standard",
    name: "Standard Shipping",
    description: "Free standard shipping across the United States.",
    costCents: 0,
    deliveryEstimate: "3–5 business days",
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    slug: "express",
    name: "Express Shipping",
    description: "Flat-rate express shipping across the United States.",
    costCents: 1500,
    deliveryEstimate: "1–2 business days",
  },
];

export interface ContactAndAddressFormProps {
  initialSession?: CheckoutSessionData | null;
  shippingMethods?: ShippingMethodData[];
  subtotalCents?: number;
  totalCents?: number;
}

export function ContactAndAddressForm({
  initialSession,
  shippingMethods = DEFAULT_SHIPPING_METHODS,
  subtotalCents,
  totalCents,
}: ContactAndAddressFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [savedSession, setSavedSession] = useState<CheckoutSessionData | null>(
    initialSession ?? null,
  );
  const [isEditing, setIsEditing] = useState<boolean>(!initialSession);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Form field state
  const [email, setEmail] = useState(savedSession?.email ?? "");
  const [recipientName, setRecipientName] = useState(savedSession?.recipientName ?? "");
  const [line1, setLine1] = useState(savedSession?.line1 ?? "");
  const [line2, setLine2] = useState(savedSession?.line2 ?? "");
  const [city, setCity] = useState(savedSession?.city ?? "");
  const [state, setState] = useState(savedSession?.state ?? "NY");
  const [zip, setZip] = useState(savedSession?.zip ?? "");
  const [phone, setPhone] = useState(savedSession?.phone ?? "");

  const [errors, setErrors] = useState<CheckoutInputErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleStartEdit() {
    if (savedSession) {
      setEmail(savedSession.email);
      setRecipientName(savedSession.recipientName);
      setLine1(savedSession.line1);
      setLine2(savedSession.line2 ?? "");
      setCity(savedSession.city);
      setState(savedSession.state);
      setZip(savedSession.zip);
      setPhone(savedSession.phone ?? "");
    }
    setErrors({});
    setGlobalError(null);
    setIsEditing(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGlobalError(null);

    const payload = {
      email,
      recipientName,
      line1,
      line2: line2 || null,
      city,
      state,
      zip,
      country: "US",
      phone: phone || null,
    };

    // Client-side validation first
    const clientValidation = parseCheckoutContactAndAddress(payload);
    if (!clientValidation.ok) {
      setErrors(clientValidation.errors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/checkout/contact-and-address", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data && data.errors) {
          setErrors(data.errors);
        } else {
          setGlobalError(data?.error || "Could not save address. Please try again.");
        }
        setIsSubmitting(false);
        return;
      }

      setSavedSession((prev) => ({
        ...data.checkoutSession,
        shippingMethodId: prev?.shippingMethodId ?? null,
        shippingMethod: prev?.shippingMethod ?? null,
      }));
      setIsEditing(false);
      setIsSubmitting(false);

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setGlobalError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  const isStep1Complete = !isEditing && savedSession !== null;
  const isStep2Complete = isStep1Complete && Boolean(savedSession?.shippingMethodId);

  const selectedShippingCost = savedSession?.shippingMethod?.costCents ?? 0;
  const taxCalculation =
    savedSession?.state && subtotalCents !== undefined
      ? calculateSalesTax(subtotalCents, savedSession.state)
      : null;
  const clientTotalCents =
    (subtotalCents ?? 0) + selectedShippingCost + (taxCalculation?.taxCents ?? 0);
  const effectiveTotalCents = totalCents ?? clientTotalCents;

  async function handlePay() {
    setPaymentError(null);
    setIsPaying(true);

    try {
      const response = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPaymentError(
          data?.error || "Payment simulation failed. Please try again.",
        );
        setIsPaying(false);
        return;
      }

      if (data?.redirectUrl) {
        router.push(data.redirectUrl);
      } else if (data?.reference) {
        router.push(`/checkout/confirmation/${data.reference}`);
      }
    } catch {
      setPaymentError(
        "A network error occurred while processing payment. Please try again.",
      );
      setIsPaying(false);
    }
  }

  return (
    <div className="checkout-flow" data-testid="checkout-flow">
      {/* Step 1: Contact & Shipping Address */}
      <section
        className={`checkout-step ${isStep1Complete ? "checkout-step--completed" : "checkout-step--active"}`}
        data-testid="step-contact-and-address"
      >
        <header className="checkout-step__header">
          <div className="checkout-step__title-wrap">
            <span className="checkout-step__badge">01</span>
            <h2 className="checkout-step__title">Contact &amp; Shipping Address</h2>
          </div>
          {isStep1Complete ? (
            <span className="checkout-step__status-tag">Completed</span>
          ) : null}
        </header>

        {isStep1Complete && savedSession ? (
          <div className="checkout-summary-card" data-testid="address-summary-card">
            <div className="checkout-summary-card__content">
              <div className="checkout-summary-card__group">
                <span className="checkout-summary-card__label">Contact Email</span>
                <p className="checkout-summary-card__text" data-testid="summary-email">
                  {savedSession.email}
                </p>
              </div>

              <div className="checkout-summary-card__group">
                <span className="checkout-summary-card__label">Delivery Destination</span>
                <p
                  className="checkout-summary-card__text checkout-summary-card__name"
                  data-testid="summary-recipient-name"
                >
                  {savedSession.recipientName}
                </p>
                <p className="checkout-summary-card__text" data-testid="summary-address">
                  {savedSession.line1}
                  {savedSession.line2 ? `, ${savedSession.line2}` : ""}
                </p>
                <p className="checkout-summary-card__text" data-testid="summary-location">
                  {savedSession.city}, {savedSession.state} {savedSession.zip}
                </p>
                <p className="checkout-summary-card__text checkout-summary-card__country">
                  United States
                </p>
                {savedSession.phone ? (
                  <p className="checkout-summary-card__text" data-testid="summary-phone">
                    Phone: {savedSession.phone}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              className="checkout-summary-card__edit-btn"
              data-testid="edit-contact-address"
              onClick={handleStartEdit}
            >
              Modify
            </button>
          </div>
        ) : (
          <form
            className="checkout-form"
            onSubmit={handleSubmit}
            noValidate
            data-testid="checkout-contact-address-form"
          >
            <p className="checkout-form__hint">
              Please enter your contact email and United States shipping address.
            </p>

            {globalError ? (
              <div className="checkout-form__alert" role="alert" data-testid="global-error">
                {globalError}
              </div>
            ) : null}

            {/* Email Field */}
            <div className="checkout-form__field">
              <label htmlFor="checkout-email" className="checkout-form__label">
                Email Address <span className="checkout-form__required">*</span>
              </label>
              <input
                id="checkout-email"
                name="email"
                type="email"
                className={`checkout-form__input ${errors.email ? "checkout-form__input--error" : ""}`}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                data-testid="input-email"
              />
              {errors.email ? (
                <p className="checkout-form__error" role="alert" data-testid="error-email">
                  {errors.email}
                </p>
              ) : null}
            </div>

            {/* Recipient Full Name */}
            <div className="checkout-form__field">
              <label htmlFor="checkout-recipient-name" className="checkout-form__label">
                Recipient Full Name <span className="checkout-form__required">*</span>
              </label>
              <input
                id="checkout-recipient-name"
                name="recipientName"
                type="text"
                className={`checkout-form__input ${errors.recipientName ? "checkout-form__input--error" : ""}`}
                placeholder="First and last name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                autoComplete="name"
                data-testid="input-recipient-name"
              />
              {errors.recipientName ? (
                <p className="checkout-form__error" role="alert" data-testid="error-recipient-name">
                  {errors.recipientName}
                </p>
              ) : null}
            </div>

            {/* Address Line 1 */}
            <div className="checkout-form__field">
              <label htmlFor="checkout-line1" className="checkout-form__label">
                Street Address <span className="checkout-form__required">*</span>
              </label>
              <input
                id="checkout-line1"
                name="line1"
                type="text"
                className={`checkout-form__input ${errors.line1 ? "checkout-form__input--error" : ""}`}
                placeholder="Street address or P.O. Box"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                autoComplete="address-line1"
                data-testid="input-line1"
              />
              {errors.line1 ? (
                <p className="checkout-form__error" role="alert" data-testid="error-line1">
                  {errors.line1}
                </p>
              ) : null}
            </div>

            {/* Address Line 2 */}
            <div className="checkout-form__field">
              <label htmlFor="checkout-line2" className="checkout-form__label">
                Apt, Suite, Unit <span className="checkout-form__optional">(Optional)</span>
              </label>
              <input
                id="checkout-line2"
                name="line2"
                type="text"
                className="checkout-form__input"
                placeholder="Apartment, suite, unit, building, floor, etc."
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                autoComplete="address-line2"
                data-testid="input-line2"
              />
            </div>

            {/* City, State, ZIP in responsive row */}
            <div className="checkout-form__row">
              <div className="checkout-form__field checkout-form__field--city">
                <label htmlFor="checkout-city" className="checkout-form__label">
                  City <span className="checkout-form__required">*</span>
                </label>
                <input
                  id="checkout-city"
                  name="city"
                  type="text"
                  className={`checkout-form__input ${errors.city ? "checkout-form__input--error" : ""}`}
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  data-testid="input-city"
                />
                {errors.city ? (
                  <p className="checkout-form__error" role="alert" data-testid="error-city">
                    {errors.city}
                  </p>
                ) : null}
              </div>

              <div className="checkout-form__field checkout-form__field--state">
                <label htmlFor="checkout-state" className="checkout-form__label">
                  State <span className="checkout-form__required">*</span>
                </label>
                <select
                  id="checkout-state"
                  name="state"
                  className={`checkout-form__select ${errors.state ? "checkout-form__input--error" : ""}`}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  autoComplete="address-level1"
                  data-testid="select-state"
                >
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} – {s.name}
                    </option>
                  ))}
                </select>
                {errors.state ? (
                  <p className="checkout-form__error" role="alert" data-testid="error-state">
                    {errors.state}
                  </p>
                ) : null}
              </div>

              <div className="checkout-form__field checkout-form__field--zip">
                <label htmlFor="checkout-zip" className="checkout-form__label">
                  ZIP Code <span className="checkout-form__required">*</span>
                </label>
                <input
                  id="checkout-zip"
                  name="zip"
                  type="text"
                  className={`checkout-form__input ${errors.zip ? "checkout-form__input--error" : ""}`}
                  placeholder="10001"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  autoComplete="postal-code"
                  data-testid="input-zip"
                />
                {errors.zip ? (
                  <p className="checkout-form__error" role="alert" data-testid="error-zip">
                    {errors.zip}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Country (US fixed) & Phone (optional) */}
            <div className="checkout-form__row">
              <div className="checkout-form__field">
                <label htmlFor="checkout-country" className="checkout-form__label">
                  Country
                </label>
                <input
                  id="checkout-country"
                  type="text"
                  className="checkout-form__input checkout-form__input--disabled"
                  value="United States (US)"
                  readOnly
                  disabled
                  data-testid="input-country"
                />
              </div>

              <div className="checkout-form__field">
                <label htmlFor="checkout-phone" className="checkout-form__label">
                  Phone Number <span className="checkout-form__optional">(Optional)</span>
                </label>
                <input
                  id="checkout-phone"
                  name="phone"
                  type="tel"
                  className="checkout-form__input"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  data-testid="input-phone"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="checkout-form__actions">
              <button
                type="submit"
                className="checkout-form__submit-btn"
                disabled={isSubmitting}
                data-testid="checkout-submit-address"
              >
                {isSubmitting ? "Saving…" : "Continue to Shipping"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Step 2: Shipping Method */}
      {isStep1Complete ? (
        <ShippingMethodForm
          shippingMethods={shippingMethods}
          initialMethodId={savedSession?.shippingMethodId}
          initialMethod={savedSession?.shippingMethod}
          onSaved={(method) => {
            setSavedSession((prev) =>
              prev
                ? {
                    ...prev,
                    shippingMethodId: method.id,
                    shippingMethod: method,
                  }
                : null,
            );
          }}
        />
      ) : (
        <section
          className="checkout-step checkout-step--upcoming"
          data-testid="step-shipping-method"
        >
          <header className="checkout-step__header">
            <div className="checkout-step__title-wrap">
              <span className="checkout-step__badge">02</span>
              <h2 className="checkout-step__title">Shipping Method</h2>
            </div>
            <span className="checkout-step__upcoming-tag">Pending Step 1</span>
          </header>
        </section>
      )}

      {/* Step 3: Payment */}
      <section
        className={`checkout-step ${isStep2Complete ? "checkout-step--active" : "checkout-step--upcoming"}`}
        data-testid="step-payment"
      >
        <header className="checkout-step__header">
          <div className="checkout-step__title-wrap">
            <span className="checkout-step__badge">03</span>
            <h2 className="checkout-step__title">Payment</h2>
          </div>
          {isStep2Complete ? (
            <span
              className="checkout-step__ready-tag"
              data-testid="payment-step-ready"
            >
              Ready for Payment
            </span>
          ) : (
            <span className="checkout-step__upcoming-tag">Pending</span>
          )}
        </header>
        {isStep2Complete ? (
          <div className="checkout-step__content" data-testid="payment-step-content">
            <div className="checkout-payment-box" data-testid="payment-simulated-box">
              <p className="checkout-step__desc">
                Review your order details and place your order using our simulated payment gateway.
              </p>
              {effectiveTotalCents > 0 ? (
                <p className="checkout-payment-box__total" data-testid="payment-total-amount">
                  Total to pay: <strong>{formatPriceUSD(effectiveTotalCents)}</strong>
                </p>
              ) : null}

              {paymentError ? (
                <p
                  className="checkout-form__error checkout-form__error--banner"
                  role="alert"
                  data-testid="payment-error"
                >
                  {paymentError}
                </p>
              ) : null}

              <div className="checkout-form__actions">
                <button
                  type="button"
                  className="checkout-form__submit-btn checkout-payment-box__pay-btn"
                  onClick={handlePay}
                  disabled={isPaying}
                  data-testid="place-order-button"
                >
                  {isPaying ? "Processing Order…" : "Place Order (Simulated)"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
