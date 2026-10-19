"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import type { ProductDetailVariant } from "@/db/catalog.ts";
import { formatPriceUSD } from "@/lib/money.ts";

import { AddToCart } from "./add-to-cart";
import {
  buildVariantHref,
  getColorOptionLabel,
  getColorOptionState,
  getColorOptions,
  getDisplayPriceCents,
  getSelectedVariant,
  getSizeOptionLabel,
  getSizeOptionState,
  getSizeOptions,
  getStockMessage,
  selectColor,
  selectSize,
} from "./variant-selection";
import type { VariantOptionState, VariantSelection } from "./variant-selection";

interface VariantSelectorProps {
  variants: ProductDetailVariant[];
  basePriceCents: number;
  initialSelection: VariantSelection;
}

function optionClassName(base: string, state: VariantOptionState, selected: boolean): string {
  const classes = [base];
  if (selected) classes.push(`${base}--selected`);
  if (state === "out_of_stock") classes.push(`${base}--out-of-stock`);
  if (state === "unavailable") classes.push(`${base}--unavailable`);
  return classes.join(" ");
}

/**
 * Size/color selector for the product detail page. Selection is client view
 * state so price and availability update instantly; the URL is mirrored with
 * `history.replaceState` (no navigation request, no new history entry and no
 * scroll jump) so a selection is shareable and survives a reload.
 *
 * Unavailable options stay focusable and carry `aria-disabled` plus a reason in
 * their accessible name; activation is a guarded no-op rather than a native
 * `disabled` attribute so the reason remains discoverable.
 */
export function VariantSelector({
  variants,
  basePriceCents,
  initialSelection,
}: VariantSelectorProps) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<VariantSelection>(initialSelection);

  const sizeOptions = getSizeOptions(variants);
  const colorOptions = getColorOptions(variants);
  const selectedVariant = getSelectedVariant(variants, selection);
  const priceCents = getDisplayPriceCents(basePriceCents, selectedVariant);
  const stockMessage = getStockMessage(selection, selectedVariant);

  // One polite announcement per change: current variant (or "none"), price and
  // availability. It is visually hidden but always in the accessibility tree.
  const variantLabel =
    selection.size !== undefined && selection.color !== undefined
      ? `${selection.size} / ${selection.color}`
      : "No variant selected";
  const announcement = `${variantLabel}. ${formatPriceUSD(priceCents)}. ${stockMessage}`;

  function commit(next: VariantSelection) {
    setSelection(next);
    window.history.replaceState(null, "", buildVariantHref(pathname, next));
  }

  function handleSize(size: (typeof sizeOptions)[number], state: VariantOptionState) {
    if (state !== "selectable") return;
    commit(selectSize(variants, selection, size));
  }

  function handleColor(color: string, state: VariantOptionState) {
    if (state !== "selectable") return;
    commit(selectColor(variants, selection, color));
  }

  return (
    <div className="product-variant" data-testid="variant-selector">
      <p className="product-detail__price" data-testid="product-price">
        {formatPriceUSD(priceCents)}
        <span className="product-detail__price-note">
          {" "}
          USD, tax-exclusive. Sales tax calculated at checkout.
        </span>
      </p>

      <fieldset className="product-variant__group">
        <legend className="product-variant__legend">Size</legend>
        <div className="product-variant__sizes">
          {sizeOptions.map((size) => {
            const state = getSizeOptionState(variants, selection, size);
            const label = getSizeOptionLabel(size, state, selection);
            const selected = selection.size === size;
            return (
              <button
                key={size}
                type="button"
                className={optionClassName("product-variant__size", state, selected)}
                aria-label={label}
                aria-pressed={selected}
                aria-disabled={state !== "selectable" ? true : undefined}
                data-testid={`variant-size-${size}`}
                data-state={state}
                onClick={() => handleSize(size, state)}
              >
                {size}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="product-variant__group">
        <legend className="product-variant__legend">Color</legend>
        <div className="product-variant__colors">
          {colorOptions.map((option) => {
            const state = getColorOptionState(variants, selection, option.color);
            const label = getColorOptionLabel(option.color, state, selection);
            const selected = selection.color === option.color;
            return (
              <button
                key={option.color}
                type="button"
                className={optionClassName("product-variant__color", state, selected)}
                aria-label={label}
                aria-pressed={selected}
                aria-disabled={state !== "selectable" ? true : undefined}
                data-testid={`variant-color-${option.color}`}
                data-state={state}
                onClick={() => handleColor(option.color, state)}
              >
                <span
                  className="product-variant__swatch"
                  style={{ backgroundColor: option.colorHex }}
                  aria-hidden="true"
                />
                <span className="product-variant__color-name">{option.color}</span>
                {selected ? (
                  <span className="product-variant__color-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="product-variant__stock" data-testid="variant-stock-message">
        {stockMessage}
      </p>

      <AddToCart variant={selectedVariant} />

      <p
        className="product-variant__live"
        data-testid="variant-live-region"
        aria-live="polite"
      >
        {announcement}
      </p>
    </div>
  );
}
