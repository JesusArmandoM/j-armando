# Validation — `chat-assistant-guardrails`

- Date: 2026-10-19
- Validator: `feature-validator` (independent, subagent)
- Spec: `docs/specs/chat-assistant-guardrails.md`
- Implementer status at review: `passing` (25 test files / 160 tests; baseline 18 / 107)
- Verdict (round 1): **revise** (one High finding in the post-generation answer guard)
- Verdict (round 2, re-validation after repair, 2026-10-19): **accept**

## Checks rerun by the validator

| Check | Result |
| --- | --- |
| `./init.sh` | exit 0 — install + lint + typecheck + tests; **25 test files / 160 tests passed**; no provider call, no `DATABASE_URL`, no key (DB project used the ephemeral embedded PostgreSQL). |
| `pnpm build` with `.env` moved aside and `DATABASE_URL`/`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`CHAT_ASSISTANT_MODEL` unset | exit 0; routes `○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /catalog`, `ƒ /products/[slug]`. Proves lazy provider/DB composition. `.env` restored afterwards. |
| Focused scenario code review | `lib/chat/guarded-chat-assistant.test.ts`, `lib/chat/guardrails/*.test.ts`, `db/tests/chat-catalog.test.ts`, `app/api/chat/route.test.ts`, `lib/chat/openai-chat-assistant.test.ts` inspected; tests use fake assistants/catalogs, injected `fetch`, or the embedded DB only. |
| Ad-hoc runtime probes (temporary script, deleted) | Policy/price/out-of-scope routing, follow-ups, combinations and catalog-failure paths exercised directly against the decorator (see findings). |

## Acceptance-scenario results

| Scenario | Result |
| --- | --- |
| 1 — shipping cost exact unknown, no `$`, no LLM | **Pass** |
| 2 — return/refund exact unknown, no invented terms, no LLM | **Pass** |
| 3 — published price from integer cents via `formatPriceUSD` | **Pass** (`$349.00 (USD, tax-exclusive)`) |
| 4 — draft/archived/unknown price discloses nothing | **Pass** (published-only query; no-price reply) |
| 5 — out-of-scope + prompt-injection fixed refusal, no LLM | **Pass** for the listed categories |
| 6 — in-scope delegates with `verifiedFacts`; reply unchanged | **Pass** |
| 7 — fabricated `$999.00` discarded | **Pass** for that amount; see F1 for a guard bypass |
| 8 — catalog failure never falls back to LLM for a price | **Pass** |

## Findings

### F1 (High) — `guardLlmAnswer` accepts short unverified amounts as substrings of a verified price

- Evidence: `lib/chat/guardrails/answer-guard.ts` uses `allowed.includes(amount)` after joining the allowed facts. Because `"$349.00".includes("$3")` and `"...$349.00...".includes("$34")` are true, a fabricated `$3` / `$34` / `$349` / `$349.0` is treated as verified.
- Reproduction against the real decorator (fake provider, published overcoat at 34900 cents):
  - `Tell me about the Longline Wool Overcoat.` with fake reply `"It costs $3 more for express shipping."` → reply returned unchanged; LLM called once.
  - `What does the overcoat go for?` (price phrasing outside the keyword list, so it delegates) with the same fake reply → `"It costs $3 more for express shipping."` shown to the shopper.
  - `findUnverifiedDollarAmounts("Add $3 for express shipping.", [<fact containing $349.00>])` → `[]`.
- Why it matters: this is a shopper-visible fabricated dollar amount — the exact harm the feature exists to prevent (`CONSTRAINTS.md` rule 7; spec Verification bullet 4 / Validator Checklist bullet 4). The guard, not the prompt, is the stated guarantee.
- Required change: compare dollar amounts to the *set of amounts present in the allowed facts*, not to the concatenated string.
- Suggested implementation:
  1. In `lib/chat/guardrails/answer-guard.ts`, extract permitted amounts from `allowedFacts` with the same `DOLLAR_AMOUNT` regex.
  2. Normalise both sides (strip `,`, parse to a number of dollars/cents) and treat an amount as verified only when its numeric value equals a permitted amount. Alternatively compare full amount strings as a `Set` (which would also reject `$349`); numeric equality keeps `$349` acceptable for `$349.00`.
  3. Add regression cases to `lib/chat/guardrails/answer-guard.test.ts`: `$3`, `$34`, `$349.0`, and `$349.00 plus $3` are replaced; exact `$349.00` stays unchanged.
- Verification after fix: `pnpm test` green; `./init.sh` green; the ad-hoc probe above returns `UNVERIFIED_PRICE_REPLY`.

### F2 (Low, non-blocking) — a few shipping phrasings route to the verified market fact instead of the shipping unknown

- Evidence: `Do you ship free over $100?` matches only the `market` fact (topic `do you ship`) and returns the market answer, not the shipping-cost unknown. `Do you ship free?` behaves the same. `Is shipping free?` and `Do you offer free shipping?` correctly return the shipping unknown.
- Why it matters: no fabrication occurs and no LLM is called, but a shipping-cost question is not answered with the explicit unknown the verification bullet describes.
- Suggested hardening: add `free shipping`, `ship free`, `shipping free`, `shipping rate(s)` to the `shipping-cost` topics and cover `Do you ship free over $100?` in `intents.test.ts` / the decorator suite. Not required for acceptance if F1 is the only blocking item, but cheap to include.

### F3 (Low, non-blocking) — non-price questions about draft/archived products delegate to the LLM

- Evidence: `Tell me about the Cropped Tweed Jacket.` has no policy/price/out-of-scope intent, so it reaches the provider with only published facts. No draft field can leak (the query is published-only), but the model may name/hallucinate the draft garment.
- Why it matters: `Users And Permissions` says draft/archived products must never be named; the deterministic guarantee only covers pricing. The model has no draft data, so exposure is limited to hallucination.
- Suggested hardening (optional): treat a name/slug match against no published row but a plausible garment ask as the no-verified-price/no-information reply, or document this as an accepted residual in ADR 0004.

### F4 (Note) — in-scope answers can still volunteer unguarded policy prose

- The guard only inspects `$` amounts (per spec). A provider that volunteers "shipping is free" in an in-scope answer is not rewritten. This is consistent with the spec's Scenario 6/7 scope and the injected instructions, but it is a residual risk to record.

## Security assessment

- **Secrets:** `.env` is gitignored and untracked (`.gitignore:35 .env*`); only `.env.example` with placeholders is tracked; the live transcript contains no key. No secret found in the diff.
- **Prompt boundary:** user text stays in `messages`; the system message is built from `CHAT_SYSTEM_PROMPT` + fixed instructions + repo/catalog facts only. Asserted by the adapter test.
- **Data exposure:** `listPublishedProductFacts` is a parameterless `status = published` Drizzle query; no user input in SQL; draft/archived slugs asserted absent.
- **Determinism/offline:** gate and all chat tests use fakes/injected `fetch`/embedded PostgreSQL; no live call, network dependency or configured database. Live transcript is optional and not part of the gate.
- No blocking security finding beyond F1 (correctness of the output guard).

## Scope, architecture, docs

- Scope is clean: no schema/migration, persistence, cart/checkout/identity, UI or catalog-behaviour change; only the additive published-only read query.
- Port extension is additive (`context?`); existing adapter/route callers remain valid; UI unchanged.
- ADR 0004 exists; blocking risk #4 moved to Resolved with module/ADR pointers; #5 left blocking and noted as unknown in chat; `ARCHITECTURE.md`, `CONSTRAINTS.md` rule 7 and `docs/technical-discovery.md` are accurate.
- `feature_list.json` evidence is concrete and test-name backed; counts and build claims reproduced. `PROGRESS.md` updated (the old main-checkout root path on line 5 is pre-existing).

## Implementation Repair Brief

Goal: make the post-generation guard reject every dollar amount that is not a verified amount, including short prefixes of a real price.

Do:
1. In `lib/chat/guardrails/answer-guard.ts`, extract the permitted amounts from `allowedFacts` and compare amounts by normalised numeric value (or set membership), never by `allowedFacts.join(...).includes(amount)`.
2. Add regression tests in `lib/chat/guardrails/answer-guard.test.ts` for `$3`, `$34`, `$349.0` and `$349.00 plus $3` (must be replaced) and exact `$349.00` (must pass).
3. Optionally add `free shipping` / `ship free` / `shipping rate(s)` topics to `store-knowledge.ts` and a test for `Do you ship free over $100?` (F2); record F3/F4 as residuals if not addressed.

Do not:
- change the port, route, UI, schema, migrations or catalog behaviour;
- add a live provider call, key or `DATABASE_URL` requirement to the gate.

Run:
- `pnpm test`
- `./init.sh`
- `pnpm build` with provider/database env unset (move `.env` aside and restore it)

Update:
- `feature_list.json` evidence with the new guard test names and the re-run gate/build;
- `PROGRESS.md` session log with the repair.


---

# Re-validation (round 2) — after the F1/F2 repair

- Date: 2026-10-19
- Validator: `feature-validator` (independent, subagent)
- Spec: `docs/specs/chat-assistant-guardrails.md`
- Implementer status at review: `passing` (25 test files / 167 tests; baseline 18 / 107)
- Verdict: **accept**
- Note: no implementation code was modified and nothing was committed by the validator. `.env` was moved aside for the gate/build and restored afterwards; ad-hoc probes ran from a temporary directory outside the repo.

## Checks rerun by the validator

| Check | Result |
| --- | --- |
| `CI=true ./init.sh` (`.env` moved aside; no `DATABASE_URL`/`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`CHAT_ASSISTANT_MODEL`) | exit 0 — install + lint + typecheck + test; **25 test files / 167 tests passed**; no provider call, no configured database (DB project used the ephemeral embedded PostgreSQL 17). Reproduces the claimed count exactly. |
| `pnpm lint` | exit 0, no errors/warnings. |
| `pnpm typecheck` | exit 0. |
| `pnpm build` with `.env` still aside and the four env vars unset | exit 0; routes `○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /catalog`, `ƒ /products/[slug]` — proves lazy provider/DB composition. `.env` restored afterwards (untracked, no backup file left). |
| Independent guard/decorator probes (temporary script outside the repo, fake provider + fake catalog with the overcoat at 34900 cents) | F1 repros now replaced; F2 phrasings route to the shipping unknown; market/tax/policy routing unchanged (details below). |

## F1 (High) — closed and independently reproduced

`lib/chat/guardrails/answer-guard.ts` now extracts dollar amounts from each allowed fact with the same `DOLLAR_AMOUNT` regex and compares canonical strings (`$` spacing and thousands separators normalised) through a `Set`; it no longer compares against `allowedFacts.join(...).includes(...)`. Probe results with the verified fact containing `$349.00`:

| Reply | Guard result | Decorator result (fake provider called once) |
| --- | --- | --- |
| `It costs $3.` | replaced | `UNVERIFIED_PRICE_REPLY` |
| `It costs $34.` | replaced | `UNVERIFIED_PRICE_REPLY` |
| `It costs $349.` | replaced | `UNVERIFIED_PRICE_REPLY` |
| `It costs $349.0.` | replaced | `UNVERIFIED_PRICE_REPLY` |
| `It costs $349.00 plus $3 for express shipping.` | replaced (unverified `$3`) | `UNVERIFIED_PRICE_REPLY` |
| `It costs $ 349.00.` | accepted | unchanged |
| `It costs $349.00.` | accepted | unchanged |
| `It costs $999.00.` | replaced | `UNVERIFIED_PRICE_REPLY` |
| `What does the overcoat go for?` + `It costs $3 more for express shipping.` | — | `UNVERIFIED_PRICE_REPLY` (price phrasing outside the keyword list still delegates, but the guard now catches it) |

Whitespace/thousands normalisation without weakening the guarantee (product at 129900 cents → verified `$1,299.00`): `$1,299.00` and `$1299.00` accepted; `$1,299.0`, `$1299`, `$1,299.00 plus $3 shipping` and `$999.00` replaced. Exact set membership means a truncated amount can never inherit a verified price; the conservative direction (rejecting `$349` even though it equals `$349.00`) matches the spec's explicit requirement.

## F2 (Low) — hardened; no market/tax/policy regression

Decorator routing (all with zero LLM calls, exact knowledge copy):

| Question | Routed to |
| --- | --- |
| `Do you ship free?` / `Do you ship free over $100?` / `What are your shipping rates?` / `Is shipping free?` | shipping-cost unknown |
| `Do you offer free shipping?` | shipping-cost unknown + promotions unknown (no fabrication; slightly verbose, non-blocking) |
| `How much does shipping cost?` / `What is the shipping fee?` | shipping-cost unknown |
| `Do you sell in the US?` / `Where do you ship?` / `Which countries do you sell to?` | market fact (no regression) |
| `What is your tax policy?` / `Do you charge sales tax?` | tax-display fact (no regression) |
| `What is your return policy?` / `Can I get a refund?` | return-policy unknown |
| `Which payment methods do you accept?` / `Are there any promo codes?` | payment-methods / promotions unknown |

The shipping-cost-over-market precedence in `findFactsFor` only removes the market fact when the shipping-cost fact also matched; market questions keep their answer. Scenario 1 (`How much does shipping cost?`) still matches shipping-cost alone. The new decorator test also asserts the reply contains no `$`, `free`, `express` or `100`.

## Findings

No blocking findings. No new High/Medium finding.

- **F1 (prior High) — closed.** Exact set membership over canonical amounts; regression tests cover `$3`, `$34`, `$349`, `$349.0`, `$349.00 plus $3`, whitespace/thousands normalisation, and an end-to-end decorator case; independently reproduced.
- **F2 (prior Low) — closed.** Free-shipping/shipping-rate phrasings now return the shipping unknown; market/tax/policy routing unchanged.
- **F3/F4 (residual) — honestly documented.** `docs/specs/chat-assistant-guardrails.md` → *Residual Risks* and `feature_list.json` notes record (F3) non-price questions naming draft/archived products can still delegate with published-only facts (hallucination risk, no draft row/price leak) and (F4) the post-generation guard discards unverified dollar amounts but does not rewrite non-price policy prose. Both statements match the code and are not overstated.
- **Low note (documentation, non-blocking):** the guard inspects only `$`-sigiled amounts, which is exactly what the spec's Technical Approach and Scenario 7 require. A fabricated price written without a `$` (for example "500 dollars") would not be inspected. This is compatible with the accepted F4 wording ("only inspects dollar amounts"), but if the durable rule (`CONSTRAINTS.md` #7) is read as any numeric price claim, consider adding that example to the residual-risk text in a later documentation pass. No code change is required for this feature's acceptance criteria.
- **Low note (noise, non-blocking):** `Do you offer free shipping?` matches both shipping-cost and promotions and concatenates both unknown answers. No fabrication and no LLM call; not worth a revise.

## Security assessment

- No secret in the diff or evidence; `.env` stays gitignored/untracked and was restored; only `.env.example` placeholders are tracked.
- Prompt boundary intact: user text stays in `messages`; the system message is `CHAT_SYSTEM_PROMPT` + fixed instructions + repo/catalog facts only (`buildSystemMessage`), asserted by the adapter test.
- `listPublishedProductFacts` is a parameterless `status = published` Drizzle query; no user input reaches SQL; draft/archived rows are excluded and asserted absent in `db/tests/chat-catalog.test.ts`.
- Public read-only chat is intentional; no auth/role surface changed. No new dependency, external call, upload or persistence.
- Determinism/offline: gate and all chat tests use fakes/injected `fetch`/embedded PostgreSQL; no live call, no key, no configured database. No blocking security finding.

## Scope, architecture, docs

- Scope clean: no schema/migration, persistence, UI, cart/checkout/identity or catalog-behaviour change beyond the additive published-only read query; the port extension is optional (`context?`) and existing callers remain valid.
- Architecture: decorator behind the `ChatAssistant` port; `lib/chat/guardrails/*` imports no `next`/`react`/`db`; composition is lazy; route validation and 400/502/503 mapping unchanged.
- Docs: ADR 0004, `ARCHITECTURE.md`, `CONSTRAINTS.md` #7, `docs/risks-and-open-questions.md` (#4 Resolved, #5 still blocking and noted as unknown) and `docs/technical-discovery.md` are accurate. `feature_list.json` verification/evidence and counts (25/167, build routes) reproduce, and `PROGRESS.md` Session 016 matches the repair. Status remains `passing` pending this verdict.
- No browser E2E harness exists (repo convention); focused Vitest coverage at guard, decorator, adapter, route and DB layers is appropriate because the panel UI is unchanged.

## Verdict

**accept.** F1 is closed and independently reproduced; F2 is hardened with no market/tax/policy regression; residual F3/F4 remain honestly documented; evidence and harness counts are accurate.

Recommended state update (orchestrator): set `chat-assistant-guardrails.status` to `accepted` in `feature_list.json` and record this re-validation line.
