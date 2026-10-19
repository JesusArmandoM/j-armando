import { describe, expect, it } from "vitest";

import {
  CANNOT_CONFIRM_PRICE_REPLY,
  NO_VERIFIED_PRICE_REPLY,
  UNVERIFIED_PRICE_REPLY,
  composeProductPriceAnswer,
  composePriceWithFactsAnswer,
  composeVerifiedFactsAnswer,
  formatProductGroundingFact,
  formatProductPrice,
} from "./answer.ts";
import type { ProductFact } from "./product-match.ts";
import { STORE_KNOWLEDGE } from "./store-knowledge.ts";

const overcoat: ProductFact = {
  slug: "longline-wool-overcoat",
  name: "Longline Wool Overcoat",
  description: "A full-length overcoat.",
  composition: "70% wool.",
  care: "Dry clean only.",
  basePriceCents: 34900,
  currency: "USD",
};

const blazer: ProductFact = {
  ...overcoat,
  slug: "double-breasted-linen-blazer",
  name: "Double-Breasted Linen Blazer",
  basePriceCents: 24900,
};

const shipping = STORE_KNOWLEDGE.find((fact) => fact.id === "shipping-cost")!;

describe("deterministic answer composition", () => {
  it("formats a single catalog price from integer cents as USD and tax-exclusive", () => {
    expect(formatProductPrice(overcoat)).toBe(
      "The Longline Wool Overcoat is $349.00 (USD, tax-exclusive).",
    );
    expect(composeProductPriceAnswer([overcoat])).toBe(formatProductPrice(overcoat));
  });

  it("says it has no verified price when nothing matches", () => {
    expect(composeProductPriceAnswer([])).toBe(NO_VERIFIED_PRICE_REPLY);
    expect(NO_VERIFIED_PRICE_REPLY).toContain("published catalog items");
    expect(NO_VERIFIED_PRICE_REPLY).not.toContain("$");
  });

  it("lists every tie and asks which one instead of guessing", () => {
    const answer = composeProductPriceAnswer([overcoat, blazer]);
    expect(answer).toContain("$349.00");
    expect(answer).toContain("$249.00");
    expect(answer).toContain("Which one do you mean?");
  });

  it("answers policy facts verbatim", () => {
    expect(composeVerifiedFactsAnswer([shipping])).toBe(shipping.answer);
    expect(composeVerifiedFactsAnswer([shipping])).not.toContain("$");
  });

  it("combines a catalog price with a matched policy fact", () => {
    const answer = composePriceWithFactsAnswer([overcoat], [shipping]);
    expect(answer).toContain("$349.00");
    expect(answer).toContain(shipping.answer);
  });

  it("exposes fixed cannot-confirm and unverified-price copy", () => {
    expect(CANNOT_CONFIRM_PRICE_REPLY).toBe(
      "I can't confirm that price right now. Please try again in a moment.",
    );
    expect(UNVERIFIED_PRICE_REPLY.startsWith("I can't confirm that price")).toBe(true);
    expect(UNVERIFIED_PRICE_REPLY).not.toContain("$");
  });

  it("builds one grounding fact string with price, composition and care", () => {
    const fact = formatProductGroundingFact(overcoat);
    expect(fact).toContain("Longline Wool Overcoat");
    expect(fact).toContain("longline-wool-overcoat");
    expect(fact).toContain("$349.00");
    expect(fact).toContain("Composition: 70% wool.");
    expect(fact).toContain("Care: Dry clean only.");
  });
});
