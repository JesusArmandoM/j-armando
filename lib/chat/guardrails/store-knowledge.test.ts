import { describe, expect, it } from "vitest";

import { STORE_KNOWLEDGE, findFactsFor } from "./store-knowledge.ts";

function fact(id: string) {
  const found = STORE_KNOWLEDGE.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing fact ${id}`);
  return found;
}

describe("STORE_KNOWLEDGE", () => {
  it("answers shipping cost with the exact verified policy", () => {
    const shipping = fact("shipping-cost");

    expect(shipping.status).toBe("verified");
    expect(shipping.answer).toBe(
      "Standard shipping is free across the United States and arrives in 3–5 business days. Express shipping is $15.00 flat and arrives in 1–2 business days.",
    );
    expect(shipping.answer).toContain("$15.00");
    expect(shipping.answer).toMatch(/3–5 business days/);
    expect(shipping.answer).toMatch(/1–2 business days/);
  });

  it("answers the return policy with the exact unknown copy and no invented terms", () => {
    const returns = fact("return-policy");

    expect(returns.status).toBe("not_published");
    expect(returns.answer).toBe(
      "I don't know the return policy. Return and refund terms aren't published yet, so I can't confirm them. Please contact the store before ordering.",
    );
    expect(returns.answer.startsWith("I don't know")).toBe(true);
    expect(returns.answer).not.toContain("$");
    expect(returns.answer).not.toMatch(/\b\d+\s*(day|days|week|weeks)\b/i);
  });

  it("keeps every unpublished answer an explicit I don't know with no dollar amount", () => {
    for (const entry of STORE_KNOWLEDGE.filter((item) => item.status === "not_published")) {
      expect(entry.answer.startsWith("I don't know")).toBe(true);
      expect(entry.answer).not.toContain("$");
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });

  it("records verified tax and market facts with sources", () => {
    const tax = fact("tax-display");
    const market = fact("market");

    expect(tax.status).toBe("verified");
    expect(tax.answer).toBe(
      "Catalog prices are shown in USD and exclude sales tax. Sales tax is calculated at checkout from your shipping address.",
    );
    expect(market.status).toBe("verified");
    expect(market.answer).toBe(
      "J. Armando sells in the United States and prices everything in US dollars.",
    );
    for (const entry of STORE_KNOWLEDGE) {
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });

  it("routes policy phrases to the matching facts, case and punctuation insensitive", () => {
    expect(findFactsFor("How much does shipping cost?").map((f) => f.id)).toEqual([
      "shipping-cost",
    ]);
    expect(findFactsFor("What is your RETURN policy?").map((f) => f.id)).toEqual([
      "return-policy",
    ]);
    expect(findFactsFor("Can I get a refund?").map((f) => f.id)).toEqual(["return-policy"]);
    expect(findFactsFor("Which payment methods do you accept?").map((f) => f.id)).toEqual([
      "payment-methods",
    ]);
    expect(findFactsFor("Do you have any promo codes?").map((f) => f.id)).toEqual(["promotions"]);
    expect(findFactsFor("Do you offer free shipping?").map((f) => f.id)).toEqual([
      "shipping-cost",
    ]);
    expect(findFactsFor("Do you have any offers?").map((f) => f.id)).toEqual(["promotions"]);
    expect(findFactsFor("Is tax included?").map((f) => f.id)).toEqual(["tax-display"]);
    expect(findFactsFor("Where do you ship?").map((f) => f.id)).toEqual(["market"]);
  });

  it("does not route ordinary product questions to store facts", () => {
    expect(findFactsFor("How much is the Longline Wool Overcoat?")).toEqual([]);
    expect(findFactsFor("What fabric is the merino sweater made of?")).toEqual([]);
    expect(findFactsFor("How should I care for the linen blazer?")).toEqual([]);
  });

  it("can match an injected knowledge set instead of the default module", () => {
    const custom = [
      {
        id: "custom",
        topics: ["store hours"],
        status: "not_published" as const,
        answer: "I don't know the store hours.",
        source: "test",
      },
    ];
    expect(findFactsFor("What are your store hours?", custom).map((f) => f.id)).toEqual([
      "custom",
    ]);
  });
});
