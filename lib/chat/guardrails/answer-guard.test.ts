import { describe, expect, it } from "vitest";

import { UNVERIFIED_PRICE_REPLY } from "./answer.ts";
import { findUnverifiedDollarAmounts, guardLlmAnswer } from "./answer-guard.ts";

const verifiedFacts = [
  "The Longline Wool Overcoat is $349.00 (USD, tax-exclusive).",
  "Catalog prices are shown in USD and exclude sales tax.",
];

describe("guardLlmAnswer", () => {
  it("returns an answer unchanged when it has no dollar amount", () => {
    const content = "The overcoat is dry clean only.";
    expect(guardLlmAnswer(content, verifiedFacts)).toBe(content);
  });

  it("returns an answer unchanged when its dollar amount is verified", () => {
    const content = "The Longline Wool Overcoat is $349.00.";
    expect(findUnverifiedDollarAmounts(content, verifiedFacts)).toEqual([]);
    expect(guardLlmAnswer(content, verifiedFacts)).toBe(content);
  });

  it("replaces a fabricated dollar amount with the fixed cannot-confirm reply", () => {
    const content = "It costs $999.00.";
    expect(findUnverifiedDollarAmounts(content, verifiedFacts)).toEqual(["$999.00"]);
    expect(guardLlmAnswer(content, verifiedFacts)).toBe(UNVERIFIED_PRICE_REPLY);
  });

  it("replaces the whole answer when any one amount is unverified", () => {
    const content = "It was $349.00, now $199.00.";
    expect(guardLlmAnswer(content, verifiedFacts)).toBe(UNVERIFIED_PRICE_REPLY);
  });

  it("rejects a truncated amount that only prefixes a verified price", () => {
    for (const amount of ["$3", "$34", "$349", "$349.0"]) {
      const content = `It costs ${amount} more for express shipping.`;
      expect(findUnverifiedDollarAmounts(content, verifiedFacts)).toEqual([amount]);
      expect(guardLlmAnswer(content, verifiedFacts)).toBe(UNVERIFIED_PRICE_REPLY);
    }
  });

  it("replaces an answer that mixes a verified amount with an unverified short amount", () => {
    const content = "It costs $349.00 plus $3 for express shipping.";
    expect(findUnverifiedDollarAmounts(content, verifiedFacts)).toEqual(["$3"]);
    expect(guardLlmAnswer(content, verifiedFacts)).toBe(UNVERIFIED_PRICE_REPLY);
  });

  it("accepts a verified amount with whitespace or thousands separators normalized", () => {
    expect(guardLlmAnswer("It costs $ 349.00.", verifiedFacts)).toBe("It costs $ 349.00.");
    expect(
      guardLlmAnswer(
        "It costs $1,299.00.",
        ["The Longline Wool Overcoat is $1299.00 (USD, tax-exclusive)."],
      ),
    ).toBe("It costs $1,299.00.");
  });

  it("treats every dollar amount as unverified when there are no allowed facts", () => {
    expect(guardLlmAnswer("Only $10 today!", [])).toBe(UNVERIFIED_PRICE_REPLY);
  });
});
