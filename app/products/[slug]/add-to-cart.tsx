"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { MAX_ADD_QUANTITY } from "@/app/cart/cart-input";
import type { ProductDetailVariant } from "@/db/catalog.ts";

// Add-to-cart control. The server owns availability and price: this component
// sends only the selected variant id and quantity. It never sends a price, a
// product slug, a cart id or a session token.

const FALLBACK_ERROR = "We could not add this item to your cart. Please try again.";

type AddStatus =
  | { kind: "idle" }
  | { kind: "pending"; variantId: string }
  | { kind: "added"; variantId: string; lineQuantity: number; variantLabel: string }
  | { kind: "error"; variantId: string; message: string };

interface AddToCartProps {
  /** Selected size/color variant, or undefined until the selector resolves one. */
  variant?: ProductDetailVariant;
}

function apiErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim() !== "") return error;
  }
  return FALLBACK_ERROR;
}

export function AddToCart({ variant }: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<AddStatus>({ kind: "idle" });
  const requestId = useRef(0);

  const maxAvailable =
    variant?.stockQty !== undefined
      ? Math.min(MAX_ADD_QUANTITY, Math.max(1, variant.stockQty))
      : MAX_ADD_QUANTITY;
  const quantityOptions = Array.from({ length: maxAvailable }, (_, index) => index + 1);
  const selectedQuantity = Math.min(quantity, maxAvailable);

  const variantId = variant?.id;
  // A confirmation belongs to the variant that produced it: changing the
  // selection hides it immediately without a state-syncing effect.
  const activeStatus: AddStatus =
    status.kind !== "idle" && status.variantId === variantId ? status : { kind: "idle" };
  const pending = activeStatus.kind === "pending";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variant || pending) return;

    const currentRequest = ++requestId.current;
    const variantLabel = `${variant.size} / ${variant.color}`;
    setStatus({ kind: "pending", variantId: variant.id });

    try {
      const response = await fetch("/api/cart/lines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: variant.id, quantity: selectedQuantity }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      if (requestId.current !== currentRequest) return;

      if (!response.ok) {
        setStatus({ kind: "error", variantId: variant.id, message: apiErrorMessage(payload) });
        return;
      }

      const lineQuantity =
        typeof payload === "object" && payload !== null
          ? (payload as { lineQuantity?: unknown }).lineQuantity
          : undefined;
      if (typeof lineQuantity !== "number" || !Number.isInteger(lineQuantity)) {
        setStatus({ kind: "error", variantId: variant.id, message: FALLBACK_ERROR });
        return;
      }

      setStatus({ kind: "added", variantId: variant.id, lineQuantity, variantLabel });
    } catch {
      if (requestId.current !== currentRequest) return;
      setStatus({ kind: "error", variantId: variant.id, message: FALLBACK_ERROR });
    }
  }

  return (
    <form className="add-to-cart" data-testid="add-to-cart" onSubmit={handleSubmit}>
      <div className="add-to-cart__field">
        <label className="add-to-cart__label" htmlFor="add-to-cart-quantity">
          Quantity
        </label>
        <select
          id="add-to-cart-quantity"
          className="add-to-cart__select"
          value={selectedQuantity}
          disabled={pending}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {quantityOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="add-to-cart__button"
        disabled={!variant || pending}
      >
        {pending ? "Adding…" : "Add to cart"}
      </button>

      {!variant ? (
        <p className="add-to-cart__hint" data-testid="add-to-cart-hint">
          Select a size and color to add to cart.
        </p>
      ) : null}

      {activeStatus.kind === "added" ? (
        <p
          className="add-to-cart__status"
          data-testid="add-to-cart-status"
          role="status"
        >
          Added to cart. {activeStatus.lineQuantity} × {activeStatus.variantLabel} in your cart.{" "}
          <Link href="/cart" className="add-to-cart__cart-link">
            View cart
          </Link>
        </p>
      ) : null}

      {activeStatus.kind === "error" ? (
        <p className="add-to-cart__error" data-testid="add-to-cart-error" role="alert">
          {activeStatus.message}
        </p>
      ) : null}
    </form>
  );
}
