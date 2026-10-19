// Post-generation guard: an LLM answer may never introduce a dollar amount the
// store has not verified. If it does, the whole answer is replaced by a fixed
// "I can't confirm that price" reply. No other rewriting happens.

import { UNVERIFIED_PRICE_REPLY } from "./answer.ts";

const DOLLAR_AMOUNT = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;

/**
 * Canonical form used only for exact set membership, so `$ 1,299.00` and
 * `$1299.00` match while a truncated `$3`, `$34`, `$349` or `$349.0` does not
 * match an allowed `$349.00`. Amounts are compared as whole strings, never as
 * substrings of an allowed fact.
 */
function canonicalAmount(amount: string): string {
  return amount.replace(/\s+/g, "").replace(/,/g, "");
}

/** Dollar amounts in `content` that are not exact amounts from an allowed fact. */
export function findUnverifiedDollarAmounts(
  content: string,
  allowedFacts: readonly string[],
): string[] {
  const amounts = content.match(DOLLAR_AMOUNT) ?? [];
  if (amounts.length === 0) return [];

  const allowedAmounts = new Set(
    allowedFacts
      .flatMap((fact) => fact.match(DOLLAR_AMOUNT) ?? [])
      .map(canonicalAmount),
  );
  return [...new Set(amounts)].filter((amount) => !allowedAmounts.has(canonicalAmount(amount)));
}

/**
 * Returns the LLM answer unchanged unless it contains a dollar amount that is
 * absent from the verified facts used to ground it.
 */
export function guardLlmAnswer(
  content: string,
  allowedFacts: readonly string[],
): string {
  return findUnverifiedDollarAmounts(content, allowedFacts).length > 0
    ? UNVERIFIED_PRICE_REPLY
    : content;
}
