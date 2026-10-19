"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatPriceUSD } from "@/lib/money.ts";
import type { CartSummaryLine } from "@/db/cart.ts";

interface CartLineRowProps {
  line: CartSummaryLine;
}

export function CartLineRow({ line }: CartLineRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingAction, setLoadingAction] = useState<"inc" | "dec" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxStepperQuantity = Math.min(10, line.availableStock ?? 10);
  const busy = isPending || loadingAction !== null;

  async function handleUpdateQuantity(newQuantity: number, action: "inc" | "dec") {
    if (busy || newQuantity < 1 || newQuantity > maxStepperQuantity) return;
    setError(null);
    setLoadingAction(action);

    try {
      const response = await fetch("/api/cart/lines", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: line.lineId, quantity: newQuantity }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data && typeof data.error === "string") ? data.error : "Could not update quantity.");
        setLoadingAction(null);
        return;
      }

      startTransition(() => {
        router.refresh();
        setLoadingAction(null);
      });
    } catch {
      setError("Could not update quantity. Please try again.");
      setLoadingAction(null);
    }
  }

  async function handleRemove() {
    if (busy) return;
    setError(null);
    setLoadingAction("remove");

    try {
      const response = await fetch("/api/cart/lines", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: line.lineId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data && typeof data.error === "string") ? data.error : "Could not remove item.");
        setLoadingAction(null);
        return;
      }

      startTransition(() => {
        router.refresh();
        setLoadingAction(null);
      });
    } catch {
      setError("Could not remove item. Please try again.");
      setLoadingAction(null);
    }
  }

  return (
    <li className="cart__line" data-testid="cart-line" key={line.lineId}>
      <div className="cart__line-main">
        <Link href={`/products/${line.productSlug}`} className="cart__line-name">
          {line.productName}
        </Link>
        <p className="cart__line-variant">
          Size {line.size} · {line.color}
        </p>
      </div>

      <p className="cart__line-cell cart__line-unit" data-testid="cart-line-unit">
        {formatPriceUSD(line.unitPriceCents)}
      </p>

      <div className="cart__line-cell cart__line-stepper" data-testid="cart-line-stepper">
        <div className="cart__stepper">
          <button
            type="button"
            className="cart__stepper-button cart__stepper-button--dec"
            data-testid="cart-line-dec"
            aria-label={`Decrease quantity of ${line.productName}`}
            disabled={busy || line.quantity <= 1}
            onClick={() => handleUpdateQuantity(line.quantity - 1, "dec")}
          >
            –
          </button>
          <span className="cart__stepper-quantity" data-testid="cart-line-quantity">
            {line.quantity}
          </span>
          <button
            type="button"
            className="cart__stepper-button cart__stepper-button--inc"
            data-testid="cart-line-inc"
            aria-label={`Increase quantity of ${line.productName}`}
            disabled={busy || line.quantity >= maxStepperQuantity}
            onClick={() => handleUpdateQuantity(line.quantity + 1, "inc")}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="cart__line-remove"
          data-testid="cart-line-remove"
          aria-label={`Remove ${line.productName} from cart`}
          disabled={busy}
          onClick={handleRemove}
        >
          {loadingAction === "remove" ? "Removing…" : "Remove"}
        </button>
      </div>

      <p className="cart__line-cell cart__line-total" data-testid="cart-line-total">
        {formatPriceUSD(line.lineTotalCents)}
      </p>

      {line.stockAdjusted ? (
        <p className="cart__line-stock-warning" data-testid="cart-line-stock-warning" role="status">
          Quantity adjusted to {line.quantity} based on available stock.
        </p>
      ) : null}

      {error ? (
        <p className="cart__line-error" role="alert" data-testid="cart-line-error">
          {error}
        </p>
      ) : null}
    </li>
  );
}
