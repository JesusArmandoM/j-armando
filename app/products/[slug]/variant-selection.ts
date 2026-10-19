import type { ProductDetailVariant } from "@/db/catalog.ts";
import type { VariantSize } from "@/db/schema/enums.ts";

// Pure size/color selection model for the product detail page. No React, no
// Next.js and no DB code: the server page parses the deep link with these
// helpers and the client selector builds every label, price and stock message
// from the same functions. Money stays integer cents until `formatPriceUSD`
// renders it.

export interface VariantSelection {
  size?: VariantSize;
  color?: string;
}

/** A shopper-facing color option derived from the stored variants. */
export interface VariantColorOption {
  /** Stored, canonical color name (English, see CONTEXT.md). */
  color: string;
  /** Stored swatch hex value. */
  colorHex: string;
}

/** Rendering state of one size tile or color swatch. */
export type VariantOptionState = "selectable" | "out_of_stock" | "unavailable";

/** Presentation order of the `variant_size` enum (XS → XL). */
const SIZE_ORDER: readonly VariantSize[] = ["XS", "S", "M", "L", "XL"];

/** Distinct sizes present in the variants, in XS → XL order. */
export function getSizeOptions(variants: readonly ProductDetailVariant[]): VariantSize[] {
  const present = new Set(variants.map((variant) => variant.size));
  return SIZE_ORDER.filter((size) => present.has(size));
}

/** Distinct colors present in the variants, alphabetical by stored name. */
export function getColorOptions(variants: readonly ProductDetailVariant[]): VariantColorOption[] {
  const byColor = new Map<string, string>();
  for (const variant of variants) {
    if (!byColor.has(variant.color)) {
      byColor.set(variant.color, variant.colorHex);
    }
  }
  return [...byColor.entries()]
    .map(([color, colorHex]) => ({ color, colorHex }))
    .sort((a, b) => a.color.localeCompare(b.color, "en"));
}

/** The exact variant for a size/color pair, if it is offered. */
export function findVariant(
  variants: readonly ProductDetailVariant[],
  size: VariantSize,
  color: string,
): ProductDetailVariant | undefined {
  return variants.find((variant) => variant.size === size && variant.color === color);
}

/** True only when the exact pair exists and has stock. */
export function isCombinationSelectable(
  variants: readonly ProductDetailVariant[],
  size: VariantSize,
  color: string,
): boolean {
  const variant = findVariant(variants, size, color);
  return variant !== undefined && variant.stockQty > 0;
}

function hasAvailableSize(
  variants: readonly ProductDetailVariant[],
  size: VariantSize,
): boolean {
  return variants.some((variant) => variant.size === size && variant.stockQty > 0);
}

function hasAvailableColor(
  variants: readonly ProductDetailVariant[],
  color: string,
): boolean {
  return variants.some((variant) => variant.color === color && variant.stockQty > 0);
}

/**
 * Applies a size choice without ever leaving the shopper on an unbuyable pair.
 * With no color chosen, any size that has at least one available variant is
 * accepted. With a color chosen, only the exact available pair is accepted;
 * otherwise the current selection is returned unchanged.
 */
export function selectSize(
  variants: readonly ProductDetailVariant[],
  current: VariantSelection,
  size: VariantSize,
): VariantSelection {
  if (!variants.some((variant) => variant.size === size)) {
    return current;
  }
  if (current.color === undefined) {
    return hasAvailableSize(variants, size) ? { ...current, size } : current;
  }
  return isCombinationSelectable(variants, size, current.color)
    ? { ...current, size }
    : current;
}

/** Color counterpart of {@link selectSize}; rejects out-of-stock/unoffered pairs. */
export function selectColor(
  variants: readonly ProductDetailVariant[],
  current: VariantSelection,
  color: string,
): VariantSelection {
  if (!variants.some((variant) => variant.color === color)) {
    return current;
  }
  if (current.size === undefined) {
    return hasAvailableColor(variants, color) ? { ...current, color } : current;
  }
  return isCombinationSelectable(variants, current.size, color)
    ? { ...current, color }
    : current;
}

/** The selected variant when both dimensions are chosen, else undefined. */
export function getSelectedVariant(
  variants: readonly ProductDetailVariant[],
  selection: VariantSelection,
): ProductDetailVariant | undefined {
  if (selection.size === undefined || selection.color === undefined) {
    return undefined;
  }
  return findVariant(variants, selection.size, selection.color);
}

/** Price in integer cents: a variant override wins over the product base price. */
export function getDisplayPriceCents(
  basePriceCents: number,
  variant: ProductDetailVariant | undefined,
): number {
  return variant?.priceOverrideCents ?? basePriceCents;
}

/** Exact stock copy shared by the visible status line and the live region. */
export function getStockMessage(
  selection: VariantSelection,
  variant: ProductDetailVariant | undefined,
): string {
  const hasSize = selection.size !== undefined;
  const hasColor = selection.color !== undefined;

  if (!hasSize && !hasColor) {
    return "Select a size and color to see availability.";
  }
  if (!hasColor) {
    return "Select a color to see availability.";
  }
  if (!hasSize) {
    return "Select a size to see availability.";
  }
  if (variant !== undefined && variant.stockQty > 0) {
    return `In stock — ${variant.stockQty} available.`;
  }
  return "Out of stock.";
}

/** Canonical product URL carrying the current selection, or the bare path. */
export function buildVariantHref(pathname: string, selection: VariantSelection): string {
  const params = new URLSearchParams();
  if (selection.size !== undefined) params.set("size", selection.size);
  if (selection.color !== undefined) params.set("color", selection.color);
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves `?size=&color=` into a selection that can actually be bought.
 *
 * - Size matches the enum case-insensitively; color matches the stored name
 *   case-insensitively and is canonicalized to the stored value.
 * - A full pair is kept only when the exact combination is selectable,
 *   otherwise the whole selection is dropped (out-of-stock pairs fall back to
 *   the empty state, never a half selection).
 * - A single dimension is kept only when it has at least one available variant.
 * - Unknown/absent values are ignored, never thrown.
 */
export function parseVariantSelection(
  searchParams: Record<string, string | string[] | undefined>,
  variants: readonly ProductDetailVariant[],
): VariantSelection {
  const sizeParam = firstValue(searchParams.size);
  const colorParam = firstValue(searchParams.color);

  const size = sizeParam
    ? getSizeOptions(variants).find(
        (option) => option.toLowerCase() === sizeParam.toLowerCase(),
      )
    : undefined;
  const color = colorParam
    ? getColorOptions(variants).find(
        (option) => option.color.toLowerCase() === colorParam.toLowerCase(),
      )?.color
    : undefined;

  if (size !== undefined && color !== undefined) {
    return isCombinationSelectable(variants, size, color) ? { size, color } : {};
  }
  if (size !== undefined) {
    return hasAvailableSize(variants, size) ? { size } : {};
  }
  if (color !== undefined) {
    return hasAvailableColor(variants, color) ? { color } : {};
  }
  return {};
}

/**
 * State of a size tile given the current selection. When a color is chosen the
 * exact pair decides; otherwise the size is selectable if any of its variants
 * has stock.
 */
export function getSizeOptionState(
  variants: readonly ProductDetailVariant[],
  selection: VariantSelection,
  size: VariantSize,
): VariantOptionState {
  if (selection.color !== undefined) {
    const variant = findVariant(variants, size, selection.color);
    if (variant === undefined) return "unavailable";
    return variant.stockQty > 0 ? "selectable" : "out_of_stock";
  }
  const candidates = variants.filter((variant) => variant.size === size);
  if (candidates.length === 0) return "unavailable";
  return candidates.some((variant) => variant.stockQty > 0)
    ? "selectable"
    : "out_of_stock";
}

/** Color counterpart of {@link getSizeOptionState}. */
export function getColorOptionState(
  variants: readonly ProductDetailVariant[],
  selection: VariantSelection,
  color: string,
): VariantOptionState {
  if (selection.size !== undefined) {
    const variant = findVariant(variants, selection.size, color);
    if (variant === undefined) return "unavailable";
    return variant.stockQty > 0 ? "selectable" : "out_of_stock";
  }
  const candidates = variants.filter((variant) => variant.color === color);
  if (candidates.length === 0) return "unavailable";
  return candidates.some((variant) => variant.stockQty > 0)
    ? "selectable"
    : "out_of_stock";
}

/**
 * Accessible name for a size tile. Unavailable options carry the reason so a
 * screen-reader user knows why activation is a no-op.
 */
export function getSizeOptionLabel(
  size: VariantSize,
  state: VariantOptionState,
  selection: VariantSelection,
): string {
  if (state === "selectable") return size;
  if (state === "out_of_stock") return `${size} — Out of stock`;
  return selection.color !== undefined
    ? `${size} — Not available in ${selection.color}`
    : `${size} — Not available`;
}

/** Accessible name for a color swatch; same reason-bearing contract as sizes. */
export function getColorOptionLabel(
  color: string,
  state: VariantOptionState,
  selection: VariantSelection,
): string {
  if (state === "selectable") return color;
  if (state === "out_of_stock") return `${color} — Out of stock`;
  return selection.size !== undefined
    ? `${color} — Not available in size ${selection.size}`
    : `${color} — Not available`;
}
