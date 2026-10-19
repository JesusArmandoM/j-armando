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
  return [
    `Product: ${product.name} (slug: ${product.slug}).`,
    `Price: ${priceClause(product)}.`,
    `Description: ${product.description}`,
    `Composition: ${product.composition}`,
    `Care: ${product.care}`,
  ].join(" ");
}
