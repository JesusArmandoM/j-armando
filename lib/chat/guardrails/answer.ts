// Deterministic answer composition for the guardrail decorator. Policy facts
// are answered verbatim; prices come from published catalog rows and are
// formatted only through the shared USD formatter. No LLM is involved here.

import { formatPriceUSD } from "../../money.ts";
import type { ProductFact } from "./product-match.ts";
import type { VerifiedFact } from "./store-knowledge.ts";

export const NO_VERIFIED_PRICE_REPLY =
  "I don't have a verified price for that. I can only quote prices for published catalog items — please name the garment or open its product page.";

export const CANNOT_CONFIRM_PRICE_REPLY =
  "I can't confirm that price right now. Please try again in a moment.";

/** Fixed replacement when an LLM answer contains a dollar amount we cannot verify. */
export const UNVERIFIED_PRICE_REPLY =
  "I can't confirm that price. I can only quote prices from the published catalog — please check the product page or contact the store.";

/** Honest answer when the catalog has no published measurements/size chart. */
export const NO_SIZE_CHART_REPLY =
  "I don't have a published size chart or body measurements. Each product page lists the available sizes and colors; if you're between sizes, please contact the store.";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;
const SIZE_RANK = new Map<string, number>(SIZE_ORDER.map((size, index) => [size, index]));

function orderedSizes(variants: ProductFact["variants"]): string[] {
  return [...new Set(variants.map((variant) => variant.size))].sort((a, b) => {
    const rankA = SIZE_RANK.get(a) ?? SIZE_ORDER.length;
    const rankB = SIZE_RANK.get(b) ?? SIZE_ORDER.length;
    return rankA - rankB || a.localeCompare(b);
  });
}

function orderedColors(variants: ProductFact["variants"]): string[] {
  return [...new Set(variants.map((variant) => variant.color))];
}

function formatVariantPairs(variants: ProductFact["variants"]): string {
  return variants.map((variant) => `${variant.size} in ${variant.color}`).join(", ");
}

function priceClause(product: ProductFact): string {
  return `${formatPriceUSD(product.basePriceCents)} (${product.currency}, tax-exclusive)`;
}

/** e.g. "The Longline Wool Overcoat is $349.00 (USD, tax-exclusive)." */
export function formatProductPrice(product: ProductFact): string {
  return `The ${product.name} is ${priceClause(product)}.`;
}

/** Answers joined verbatim, preserving the knowledge module's exact copy. */
export function composeVerifiedFactsAnswer(facts: readonly VerifiedFact[]): string {
  return facts.map((fact) => fact.answer).join(" ");
}

/**
 * One price, an explicit request to choose when several published products
 * match, or the no-verified-price reply when nothing matches.
 */
export function composeProductPriceAnswer(products: readonly ProductFact[]): string {
  if (products.length === 0) return NO_VERIFIED_PRICE_REPLY;
  if (products.length === 1) return formatProductPrice(products[0]);

  const listed = products
    .map((product) => `the ${product.name} is ${priceClause(product)}`)
    .join("; ");
  return `I found more than one published item: ${listed}. Which one do you mean?`;
}

/** Price answer followed by any policy facts matched in the same message. */
export function composePriceWithFactsAnswer(
  products: readonly ProductFact[],
  facts: readonly VerifiedFact[],
): string {
  return [composeProductPriceAnswer(products), composeVerifiedFactsAnswer(facts)]
    .filter((part) => part !== "")
    .join(" ");
}

/** One verified-fact string injected into the LLM context for a matched product. */
export function formatProductGroundingFact(product: ProductFact): string {
  const sizes = orderedSizes(product.variants);
  const colors = orderedColors(product.variants);
  const inStock = product.variants.filter((variant) => variant.stockQty > 0);
  return [
    `Product: ${product.name} (slug: ${product.slug}).`,
    `Category: ${product.categoryName}.`,
    `Price: ${priceClause(product)}.`,
    `Description: ${product.description}`,
    `Composition: ${product.composition}`,
    `Care: ${product.care}`,
    product.variants.length > 0
      ? `Available sizes: ${sizes.join(", ")}. Available colors: ${colors.join(", ")}. In stock: ${inStock.length > 0 ? formatVariantPairs(inStock) : "none"}.`
      : "Available sizes and colors: not published.",
  ].join(" ");
}

/**
 * Deterministic sizing answer from published variants. It never invents
 * measurements: when the catalog has no size chart, it says so explicitly.
 */
export function formatProductSizing(product: ProductFact): string {
  if (product.variants.length === 0) {
    return `The ${product.name}: ${NO_SIZE_CHART_REPLY}`;
  }

  const sizes = orderedSizes(product.variants);
  const colors = orderedColors(product.variants);
  const inStock = product.variants.filter((variant) => variant.stockQty > 0);
  const outOfStock = product.variants.filter((variant) => variant.stockQty === 0);
  const parts = [
    `The ${product.name} comes in sizes ${sizes.join(", ")} and colors ${colors.join(", ")}.`,
  ];
  if (inStock.length > 0) {
    parts.push(`In stock: ${formatVariantPairs(inStock)}.`);
  }
  if (outOfStock.length > 0) {
    parts.push(`Currently out of stock: ${formatVariantPairs(outOfStock)}.`);
  }
  parts.push(NO_SIZE_CHART_REPLY);
  return parts.join(" ");
}

/** One sizing answer, or the generic no-size-chart copy when nothing matched. */
export function composeProductSizingAnswer(products: readonly ProductFact[]): string {
  if (products.length === 0) return NO_SIZE_CHART_REPLY;
  return products.map(formatProductSizing).join(" ");
}

/**
 * Deterministic product fact sheet for style/material/care/details questions.
 * It uses only published catalog rows and the shared USD formatter.
 */
export function formatProductInfo(product: ProductFact): string {
  const availability =
    product.variants.length > 0
      ? `Available sizes: ${orderedSizes(product.variants).join(", ")}. Available colors: ${orderedColors(product.variants).join(", ")}.`
      : "Available sizes and colors are not published.";
  return `The ${product.name} (${product.categoryName}): ${product.description} Composition: ${product.composition} Care: ${product.care} ${availability} Price: ${priceClause(product)}.`;
}

/** One or more product fact sheets for a matched category/product question. */
export function composeProductInfoAnswer(products: readonly ProductFact[]): string {
  return products.map(formatProductInfo).join(" ");
}
