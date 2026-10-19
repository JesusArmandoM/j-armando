// Deterministic intent routing for the storefront assistant. These matchers run
// before the LLM is called, so policy, price and clearly out-of-scope questions
// are answered without generating content (docs/adr/0004-chat-assistant-guardrails.md).

import { STORE_KNOWLEDGE, findFactsFor } from "./store-knowledge.ts";
import type { VerifiedFact } from "./store-knowledge.ts";

/** Fixed English refusal for requests that are not about the store. */
export const OUT_OF_SCOPE_REPLY =
  "I can only help with J. Armando products, sizing, fabric and care, and published store facts. I can't help with other topics.";

/** Lowercases and separates words so patterns ignore punctuation and casing. */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Returns the verified/unknown store facts a message asks about. */
export function matchPolicyTopics(
  message: string,
  knowledge: readonly VerifiedFact[] = STORE_KNOWLEDGE,
): VerifiedFact[] {
  return findFactsFor(message, knowledge);
}

const PRICE_INTENT =
  /\b(price|prices|pricing|cost|costs|how much|expensive|cheap|cheaper)\b|\busd\b|\bdollars?\b/;

/** True when the shopper is asking about a price or cost. */
export function hasPriceIntent(message: string): boolean {
  // `$` is punctuation and is stripped by normalization, so check it raw.
  return PRICE_INTENT.test(normalizeMessage(message)) || /\$\s?\d/.test(message);
}

const OUT_OF_SCOPE_PATTERNS: readonly RegExp[] = [
  // Prompt injection / attempts to reveal configuration.
  /\b(ignore (all |your |the )?(previous |prior )?instructions|system prompt|developer prompt|hidden prompt|reveal (your |the )?(prompt|instructions|key)|your (api|secret) key|api key|secret key|jailbreak|developer mode|you are now)\b/,
  // Weather.
  /\b(weather|forecast|temperature|rain|snow|sunny|humidity)\b/,
  // News and politics.
  /\b(news|politics|political|election|president|government|senator)\b/,
  // Sport.
  /\b(sport|sports|football|basketball|baseball|soccer|tennis|olympics|game score|match score)\b/,
  // Recipes and cooking.
  /\b(recipe|recipes|cook|cooking|bake|baking|ingredients?)\b/,
  // Coding.
  /\b(code|coding|program|programming|javascript|typescript|python|function|bug|debug|sql)\b/,
  // Homework and mathematics.
  /\b(homework|math|mathematics|equation|algebra|calculus|solve|calculation)\b/,
  // Translation.
  /\b(translate|translation|in spanish|in french|in german|in italian)\b/,
  // Medical, legal and financial advice.
  /\b(medical|medicine|doctor|diagnosis|symptom|symptoms|lawyer|attorney|legal advice|investment|investments|stocks?|financial advice|crypto)\b/,
  // Other retailers.
  /\b(amazon|zara|nordstrom|another store|other store|competitor|competitors)\b/,
];

/**
 * True for clearly unrelated requests. Callers must check policy and price
 * intents first, so store facts (e.g. "promo code", "sales tax") win.
 */
export function isOutOfScope(message: string): boolean {
  const text = normalizeMessage(message);
  if (text === "") return false;
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
}
