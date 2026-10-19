# ADR 0004 — Chat guardrails use repo-owned verified facts plus catalog price grounding

- Status: accepted
- Date: 2026-10-19
- Decided during: `chat-assistant-guardrails`
- Source spec: `docs/specs/chat-assistant-guardrails.md`

## Context

The assistant previously relied on a prompt asking the LLM not to invent prices or policies.
A prompt is not a guarantee. Shipping cost rules are undecided (#5) and returns are outside MVP
scope, so no verified shipping/return policy exists yet. Catalog prices exist in PostgreSQL as
integer cents, USD, tax-exclusive. The gate must stay offline/key-free and AI capabilities stay
behind repo-owned ports.

## Decision

1. Verified policies live in `lib/chat/guardrails/store-knowledge.ts` as reviewed facts with an
   exact answer, a `verified` | `not_published` status and a source reference. Unpublished facts
   answer with an explicit "I don't know".
2. Prices come from the published-only catalog query in `db/catalog.ts`, formatted with
   `formatPriceUSD`; the LLM never supplies a price.
3. A `ChatAssistant` decorator (`lib/chat/guarded-chat-assistant.ts`) deterministically answers
   policy, price and out-of-scope asks without calling the LLM. In-scope answers get verified facts
   as context; `guardLlmAnswer` discards replies containing unverified dollar amounts.
4. `app/api/chat/composition.ts` wires knowledge, the DB-backed catalog reader and the lazily
   resolved provider behind the existing port.

## Reasons

- Guarantee, not prompt hope: deterministic paths are testable and provably never call the LLM.
- Honest unknowns until #5/returns are decided; closing the gap means editing one module.
- One reviewable policy source; the DB is already authoritative for integer-cent prices.
- Minimal architecture: no RAG, vector store, schema change or new provider.

## Rejected alternatives

- Prompt-only guardrails (not a guarantee; untestable without a live LLM).
- Copying shipping/return claims from the design assets (direction, not specification).
- Tool-calling/retrieval now (heavier than needed for six published products).
- Persisting conversations or guardrail decisions (out of scope; no migration).

## Consequences

- Risks #4 moves to Resolved; #5 stays blocking for `checkout-shipping-method`.
- When shipping/returns are decided, update `store-knowledge.ts` and its tests only.
- `ChatAssistant.answer` gains an optional grounding context; deterministic answers need no key.
- The gate remains offline/key-free; a live transcript is optional evidence.

## Amendment (2026-10-19) — catalog-grounded generic product questions

Live use after acceptance showed that generic garment questions ("What coat styles and materials
do you have?") reached the LLM with no catalog facts and produced "I don't have the catalog"
replies. Sizing questions could not be answered because the chat facts omitted variants, and
"Do you offer free shipping?" appended an unrelated promotions unknown because "offer" was a
promotions trigger. The principle above is unchanged: verified sources only, deterministic where
the answer is a fact. The verified source now covers more published catalog fields.

1. `listPublishedProductFacts` joins the published product's category and non-discontinued
   variants, returning `categorySlug`, `categoryName`, and `{ size, color, stockQty }` variants
   alongside composition, care and the integer-cent base price. Still published-only; no migration.
2. `matchProducts` gains curated category synonyms (`coat/coats`, `overcoat`, `outerwear`,
   `blazer/sport coat`, `dress`, `sweater/knitwear`, `shirt`, `trousers/pants`). Multi-word
   synonyms outrank broad ones, and a specific product mention still outranks its category.
   Ambiguous `jacket`/`gown` synonyms are deliberately excluded because they collide with the
   draft `Cropped Tweed Jacket` and archived `Satin Evening Gown`; material-only asks still do not
   match.
3. Explicit sizing/fit questions are answered deterministically from published variants, including
   in-stock/out-of-stock size/color pairs. No size chart or body measurements exist in the catalog,
   so the reply says they are not published and points to the product page/store; measurements are
   never invented.
4. Explicit style/material/care/details/availability questions are answered deterministically from
   the published fact sheet (description, composition, care, sizes, colors, base price). Open-ended
   in-scope conversation still reaches the LLM, now with category/variant facts in `verifiedFacts`.
5. When shipping-cost matches, the promotions unknown is suppressed if the only trigger is the
   generic verb "offer"; explicit promo/discount/coupon/sale words still include promotions.

Consequences: the deterministic surface is larger and must stay catalog-grounded; the gate grows
to 261 tests. Adding a real size chart/measurements is a merchandising content decision, not a
guardrail change. Category synonyms need review when new categories or products are added.
