// Deterministic product matching over published catalog facts only. The caller
// supplies rows from the published-only catalog query, so draft and archived
// products can never be matched or disclosed. Matching is intentionally
// conservative: no fuzzy edit-distance guessing (see the spec's edge cases).

export interface ProductFact {
  slug: string;
  name: string;
  description: string;
  composition: string;
  care: string;
  /** Tax-exclusive base price in integer cents. */
  basePriceCents: number;
  currency: string;
}

/** Material words say little about which garment is meant; ignore them when ranking. */
const MATERIAL_TOKENS = new Set([
  "wool",
  "merino",
  "cashmere",
  "linen",
  "cotton",
  "silk",
  "satin",
  "tweed",
  "poplin",
  "polyester",
  "viscose",
  "alpaca",
]);

function normalize(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function distinctiveTokens(fact: ProductFact): string[] {
  const slugTokens = fact.slug.split(/[^a-z0-9]+/i).filter((token) => token.length > 1);
  const nameTokens = tokenize(fact.name);
  return [...new Set([...nameTokens, ...slugTokens.map((token) => token.toLowerCase())])].filter(
    (token) => !MATERIAL_TOKENS.has(token),
  );
}

/**
 * Returns the published products whose name/slug tokens best match the message.
 * A full-name mention outranks partial matches; all products tied at the best
 * score are returned so the caller can ask which one instead of guessing.
 */
export function matchProducts(
  message: string,
  facts: readonly ProductFact[],
): ProductFact[] {
  const text = normalize(message);
  if (text === "") return [];
  const messageTokens = new Set(tokenize(text));
  const namesSeveralProducts = /\b(and|or|versus|vs)\b|,/.test(text);

  let bestScore = 0;
  let best: ProductFact[] = [];
  const scored: { fact: ProductFact; score: number }[] = [];

  for (const fact of facts) {
    const tokens = distinctiveTokens(fact);
    if (tokens.length === 0) continue;

    let score = tokens.filter((token) => messageTokens.has(token)).length;
    if (text.includes(normalize(fact.name))) {
      score += 1;
    }
    if (score === 0) continue;

    scored.push({ fact, score });
    if (score > bestScore) {
      bestScore = score;
      best = [fact];
    } else if (score === bestScore) {
      best.push(fact);
    }
  }

  // A shopper asking about two garments ("the overcoat and the blazer") must
  // get both prices, not the higher-ranked one. For a single-subject question
  // only the best-scoring product(s) are returned.
  if (namesSeveralProducts && scored.length > 1) {
    return scored
      .sort((a, b) => b.score - a.score)
      .map(({ fact }) => fact);
  }

  return best;
}
