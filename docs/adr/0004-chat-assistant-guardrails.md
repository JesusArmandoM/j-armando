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
