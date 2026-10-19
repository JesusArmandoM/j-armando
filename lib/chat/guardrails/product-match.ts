// Deterministic product matching over published catalog facts only. The caller
// supplies rows from the published-only catalog query, so draft and archived
// products can never be matched or disclosed. Matching is intentionally
// conservative: no fuzzy edit-distance guessing (see the spec's edge cases).

export interface ProductFactVariant {
  size: string;
  color: string;
  /** Non-negative units currently in stock for this size/color. */
  stockQty: number;
}

/** One published body measurement, in inches (approximate). */
export interface ProductSizeMeasurement {
  /** Shopper-facing label, e.g. "Chest/bust" or "Inseam". */
  label: string;
  minIn: number;
  maxIn: number;
}

/** Category-level size chart entry for one size. */
export interface ProductSizeChartEntry {
  size: string;
  measurements: readonly ProductSizeMeasurement[];
}

export interface ProductFact {
  slug: string;
  name: string;
  description: string;
  composition: string;
  care: string;
  /** Tax-exclusive base price in integer cents. */
  basePriceCents: number;
  currency: string;
  categorySlug: string;
  categoryName: string;
  /** Non-discontinued variants only; empty when the product has none. */
  variants: readonly ProductFactVariant[];
  /** Published category measurements only; empty when none are published. */
  sizeChart: readonly ProductSizeChartEntry[];
}

/**
 * Shopper words that refer to a published category rather than a product name.
 * Only unambiguous garment nouns live here; material words never do.
 */
const CATEGORY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  coats: ["coat", "coats", "overcoat", "overcoats", "outerwear"],
  blazers: ["blazer", "blazers", "sport coat", "sport coats"],
  dresses: ["dress", "dresses"],
  knitwear: ["sweater", "sweaters", "knitwear", "jumper", "jumpers", "pullover", "pullovers"],
  shirts: ["shirt", "shirts", "button down", "button up"],
  trousers: ["trouser", "trousers", "pants", "slacks"],
};

function hasPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${normalize(phrase)} `);
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

    // A category word ("coat") finds every published product in that category,
    // but ranks below a specific product mention so "the overcoat" still wins
    // when several coats share the category.
    const synonyms = CATEGORY_SYNONYMS[fact.categorySlug] ?? [];
    const matchedSynonyms = synonyms.filter((phrase) => hasPhrase(text, phrase));
    if (matchedSynonyms.length > 0) {
      // A multi-word synonym ("sport coat") is more specific than "coat", so it
      // outranks the broader category word instead of tying with it.
      score += Math.max(...matchedSynonyms.map((phrase) => phrase.split(" ").length));
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
