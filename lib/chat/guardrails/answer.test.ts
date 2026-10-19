import { describe, expect, it } from "vitest";

import {
  CANNOT_CONFIRM_PRICE_REPLY,
  NO_SIZE_CHART_REPLY,
  NO_VERIFIED_PRICE_REPLY,
  SIZE_CHART_DISCLAIMER,
  SIZE_GUIDE_PROMPT_REPLY,
  UNVERIFIED_PRICE_REPLY,
  composeProductInfoAnswer,
  composeProductPriceAnswer,
  composeProductSizingAnswer,
  composePriceWithFactsAnswer,
  composeVerifiedFactsAnswer,
  formatProductGroundingFact,
  formatProductInfo,
  formatProductPrice,
  formatProductSizing,
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
  categorySlug: "coats",
  categoryName: "Coats",
  variants: [
    { size: "S", color: "Camel", stockQty: 0 },
    { size: "M", color: "Camel", stockQty: 14 },
    { size: "L", color: "Charcoal", stockQty: 6 },
  ],
  sizeChart: [
    {
      size: "S",
      measurements: [
        { label: "Chest/bust", minIn: 33, maxIn: 34 },
        { label: "Waist", minIn: 26, maxIn: 27 },
      ],
    },
    {
      size: "M",
      measurements: [
        { label: "Chest/bust", minIn: 35, maxIn: 36 },
        { label: "Waist", minIn: 28, maxIn: 29 },
      ],
    },
    {
      size: "L",
      measurements: [
        { label: "Chest/bust", minIn: 37, maxIn: 39 },
        { label: "Waist", minIn: 30, maxIn: 32 },
      ],
    },
  ],
};

const blazer: ProductFact = {
  ...overcoat,
  slug: "double-breasted-linen-blazer",
  name: "Double-Breasted Linen Blazer",
  basePriceCents: 24900,
  categorySlug: "blazers",
  categoryName: "Blazers",
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
    expect(composeVerifiedFactsAnswer([shipping])).toContain("$15.00");
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

  it("builds one grounding fact string with price, category, sizes and composition", () => {
    const fact = formatProductGroundingFact(overcoat);
    expect(fact).toContain("Longline Wool Overcoat");
    expect(fact).toContain("longline-wool-overcoat");
    expect(fact).toContain("Category: Coats.");
    expect(fact).toContain("$349.00");
    expect(fact).toContain("Composition: 70% wool.");
    expect(fact).toContain("Care: Dry clean only.");
    expect(fact).toContain("Available sizes: S, M, L.");
    expect(fact).toContain("Available colors: Camel, Charcoal.");
    expect(fact).toContain("In stock: M in Camel, L in Charcoal.");
    expect(fact).toContain("Body measurements (inches):");
    expect(fact).toContain("M — chest/bust 35–36, waist 28–29");
  });

  it("answers sizing from published variants and body measurements", () => {
    const answer = formatProductSizing(overcoat);
    expect(answer).toContain("The Longline Wool Overcoat comes in sizes S, M, L");
    expect(answer).toContain("colors Camel, Charcoal");
    expect(answer).toContain("In stock: M in Camel, L in Charcoal.");
    expect(answer).toContain("Currently out of stock: S in Camel.");
    expect(answer).toContain(
      "Body measurements (inches): S — chest/bust 33–34, waist 26–27; M — chest/bust 35–36, waist 28–29; L — chest/bust 37–39, waist 30–32.",
    );
    expect(answer).toContain(SIZE_CHART_DISCLAIMER);
    expect(answer).not.toContain("$");
  });

  it("never invents measurements when a matched product has no chart", () => {
    const answer = formatProductSizing({ ...overcoat, sizeChart: [] });
    expect(answer).toContain(NO_SIZE_CHART_REPLY);
    expect(answer).not.toContain("chest");
  });

  it("asks which garment when a sizing question has no product", () => {
    expect(composeProductSizingAnswer([])).toBe(SIZE_GUIDE_PROMPT_REPLY);
    expect(SIZE_GUIDE_PROMPT_REPLY).toContain("specific garment");
    expect(SIZE_GUIDE_PROMPT_REPLY).not.toContain("$");
  });

  it("builds a product fact sheet for style/material/care questions", () => {
    const answer = formatProductInfo(overcoat);
    expect(answer).toContain("The Longline Wool Overcoat (Coats)");
    expect(answer).toContain("Composition: 70% wool.");
    expect(answer).toContain("Care: Dry clean only.");
    expect(answer).toContain("Available sizes: S, M, L.");
    expect(answer).toContain("Available colors: Camel, Charcoal.");
    expect(answer).toContain("Body measurements (inches):");
    expect(answer).toContain("$349.00");
    expect(composeProductInfoAnswer([overcoat, blazer])).toContain(
      "Double-Breasted Linen Blazer (Blazers)",
    );
  });
});
