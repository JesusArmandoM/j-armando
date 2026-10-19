# Risks and Open Questions

Project: **J. Armando**. Parent documents: `build-brief.md`, `mvp-scope.md`.

## Blocking Next Phase

These must be answered before implementation planning is final.

1. **Sign-in for accounts with no password.** Quick Access creates an account with an optional password. How does that customer reach their orders later: magic link, email OTP, or forced password creation on first return? This is the highest-risk gap in the identity model and blocks the auth design.
2. **Virtual try-on provider selection — resolved 2026-10-19 for this work.** The provider is the **DevExpert gateway image-edit** model (`POST {TRYON_BASE_URL without trailing slashes}/images/edits`; `TRYON_BASE_URL` is the API base already **including** `/v1`, so the `.env` value yields exactly `https://inference.devexpert.io/v1/images/edits`; model `TRYON_MODEL`, OpenAI-compatible images response), behind the repo-owned `TryOnProvider` port. See *Resolved*. The provider-side half of photo handling (retention, training, deletion, DPA) remains open and is tracked under #3; the number is kept so existing references stay valid.
3. **Photo consent and retention policy.** Legal basis, consent text, retention window, deletion mechanism, and whether photos of minors are prohibited. Privacy-critical for a US store and for any GDPR-covered shoppers. **Still open.** The interim implementation stance is in-memory only (no persistence, no logging of image bytes, no object storage); see `docs/specs/virtual-tryon-generation.md` → Open Questions and `docs/specs/virtual-tryon-failure.md`.
6. **Sales tax rate table.** Sales tax is added at checkout and calculated from the shipping address. Which states/rates apply at launch, and do we need economic-nexus tracking beyond a simple configurable rate table?

Numbering is preserved from earlier sessions; #4 (chat guardrails behaviour) and #5 (shipping cost rules) are resolved below.

## Implementation-Time Questions

- Styling approach capable of expressing the design system's zero-radius editorial language and token set.
- Cart merge rule when a guest signs in with an existing cart (union with quantity caps, or replace).
- Stock reservation strategy at checkout (reserve on add-to-cart vs. validate at payment) and reservation expiry.
- How a guest conversation or try-on session is attached to an account after sign-in.
- Email sending provider and templates (order confirmation is the only required one at launch).
- Object storage provider and access-control model for try-on photos — **deferred** until blocking question #3 is decided. The current try-on slice stores nothing (in-memory per request only), so no storage decision is needed yet.
- Admin authentication: same account model with an `admin` role, or a separate admin identity.
- Backoffice product data model details: composition, care, imagery per variant, SKU generation.
- Per-garment finished measurements and admin editing of size charts. The category-level body-measurement chart is published; actual garment dimensions and backoffice editing remain future work.

## Resolved

- **Try-on photo limits, provider timeout and failure handling (generation-spec open question 4)** — resolved 2026-10-19 by `virtual-tryon-failure`: accepted photos are **JPEG/PNG/WebP up to 4 MiB (inclusive)**, checked by declared MIME type and then by magic-byte signature in the route before any catalog lookup or provider call; invalid/oversized/spoofed bytes return 400 `invalid_photo` without transmission. Provider calls are **bounded at 30 s** (`AbortSignal.timeout`, adapter `timeoutMs`) and an abort maps to `TryOnProviderError` kind `timeout` → 504 `provider_timeout`; configuration/DB failures return 503 `provider_unavailable` and other provider failures 502 `provider_error`. All failure responses and panel copy are fixed (no bytes, base64, provider URLs or bodies), and the panel offers "Try again" with the same in-memory photo. **HEIC/AVIF are deliberately excluded** for now: shoppers whose phones produce HEIC must convert to JPEG/PNG/WebP, or a later feature must add conversion/support. The 4 MiB cap sits below the platform request-body limit after multipart overhead. Blocking #3 (consent/retention) remains open; retry reuses the acknowledged in-memory photo and fresh acknowledgement per retry is part of that review.
- **Shipping cost rules (blocking #5)** — resolved 2026-10-19 by user decision: **standard shipping is free across the United States (3–5 business days)** and **express shipping is $15.00 flat (1–2 business days)**. The values are seeded as `shipping_method` rows (`standard` 0 cents, `express` 1500 cents) and answered verbatim by the chat (`lib/chat/guardrails/store-knowledge.ts`). This is a store policy, not a live carrier quote; change both sources together. See `docs/specs/catalog-size-chart-and-shipping.md`.
- **Published size-chart content** — resolved 2026-10-19 by adding a category-level `size_chart` table and seed data (approximate US women's body measurements, XS–XL, inches). The product page and chat use the same published rows; sizes not offered by a product are omitted. Measurements are approximate body measurements, not garment measurements or fit predictions. See `docs/specs/catalog-size-chart-and-shipping.md`.
- **Chat assistant guardrails behaviour (blocking #4)** — resolved 2026-10-19 by `chat-assistant-guardrails`: shopper-facing policies come only from the repo-owned, versioned knowledge module `lib/chat/guardrails/store-knowledge.ts` (exact answers with `verified` | `not_published` status and a source reference), and prices come only from published catalog rows via `listPublishedProductFacts` (`db/catalog.ts`), formatted with `formatPriceUSD`. A deterministic `ChatAssistant` decorator (`lib/chat/guarded-chat-assistant.ts`) answers policy, price and out-of-scope asks without calling the LLM; in-scope answers receive verified facts as context and `guardLlmAnswer` discards unverified dollar amounts. Shipping cost and return/refund terms are `not_published` today, so both answer with an explicit "I don't know" (never a fabricated free-shipping threshold, return window or price). When they are decided, only the knowledge module and its tests change. See `adr/0004-chat-assistant-guardrails.md`.
- **ORM / data-access layer choice** — resolved 2026-10-12 by `bootstrap-database-schema`: **Drizzle ORM** (`drizzle-orm` + `drizzle-kit` over `pg`), with schema in `db/schema/` and committed SQL migrations in `db/migrations/`. See `adr/0002-drizzle-data-access-layer.md`. The managed provider (Neon vs Supabase) intentionally stays undecided — everything connects through `DATABASE_URL`.
- **Whether `pending` payment state is exposed or collapsed** — resolved 2026-10-14 by `payment-provider-abstraction`: `pending` is **surfaced distinctly** to the shopper, not collapsed into a single generic "processing" message. `pending` is a first-class `payment.pending` event (`payments/payment-provider.ts`) mapped to its own view ("Payment pending") in `payments/payment-outcome.ts` and rendered by `app/checkout/payment-outcome.tsx`; it is never presented as success or failure. This keeps the async-confirmation reality of a future real gateway visible in the UI.
- **LLM provider for the chat assistant** — resolved 2026-10-14 by `chat-assistant`: **OpenAI Chat Completions** as the first adapter behind the repo-owned `ChatAssistant` port (`lib/chat/openai-chat-assistant.ts`). Key via `OPENAI_API_KEY`; model via `CHAT_ASSISTANT_MODEL` (default `gpt-4o-mini`); optional endpoint override via `OPENAI_BASE_URL`. The provider is swappable without UI changes. Conversations are **ephemeral** for this slice (React state; the server is stateless and touches no database); persistence/ownership is deferred. The automated suite never calls the live provider — the adapter is tested with an injected `fetch` and an in-process HTTP server. See `adr/0003-chat-assistant-llm-provider.md`.
- **Virtual try-on provider** — resolved 2026-10-19 for `virtual-tryon-generation`: the **DevExpert gateway image-edit** model, called as `POST {TRYON_BASE_URL without trailing slashes}/images/edits` with `multipart/form-data` (`model`, `prompt`, `image`) and Bearer auth, behind the repo-owned `TryOnProvider` port. `TRYON_BASE_URL` is the API base already **including** `/v1` (the `.env` value yields exactly `https://inference.devexpert.io/v1/images/edits`; the adapter appends only `/images/edits`). Configuration is `TRYON_BASE_URL`, `TRYON_MODEL` and `TRYON_API_KEY` (falling back to the existing `DEVEXPERT_API_KEY`). The response follows the OpenAI images API shape (`data[0].b64_json` or `data[0].url`); the adapter prefers `b64_json`. Provider quality, latency, cost and **data-processing terms** are not validated by this decision — review before public launch. The automated suite never calls the live provider (injected `fetch` + in-process HTTP server). **Blocking #3 (photo consent/retention) remains open.**

## Later / Not MVP

- Real payment gateway (cards, 3-D Secure, PCI scope).
- Email verification and password recovery.
- Social login (Google/Apple).
- Multi-country, multi-currency, multi-language.
- Native mobile app, public third-party API.
- **AI Stylist Cross-Sell** ("Coordinados por Stylist IA" in the design assets).
- **Fit Recommendation** engine ("FITIQ" / fit predictor in the design assets).
- Newsletter subscription and marketing automation.
- Customer-facing order tracking portal / carrier integration.
- Returns, refunds, exchanges and the 30-day satisfaction guarantee flow from the design assets.
- Editorial collections/capsules as a merchandising system.
- Loyalty, gift cards, discount codes, wishlists.
- Analytics dashboards, inventory forecasting.

## Assumptions

Recorded during discovery; verify before relying on them.

- **Market/currency/tax**: **United States / USD**, with US sales tax added at checkout from the shipping address. Catalog prices are tax-exclusive. *(Confirmed during discovery.)*
- **Brand name**: `J. Armando`, replacing `LUMEN STUDIO` / `LUMEN Atelier` in all design assets and copy.
- **UI copy language**: **English**, matching the US market. The design assets are in Spanish and their copy must be rewritten. Documentation language: English.
- **Design authority**: the design assets are a **proposal and may be redesigned** where MVP scope requires it; they are direction, not a rigid specification.
- **Buyer = end user**: no gift purchase, no organizations, no delegated accounts.
- **Admin is also a customer**: one account can hold both roles.
- **Simulated payment is enough** for the MVP; no real money moves.
- **Chat assistant scope**: product, sizing, fabric, shipping and store-policy questions.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| **No password recovery / no email verification** | Production stores need both. A shopper who forgets a password is locked out; an email the shopper does not own exposes order data. This is an explicit user decision and a real production risk. | Revisit before public launch. Minimum viable fix: magic-link sign-in. |
| **Photo privacy** | Try-on photos are sensitive personal data (possibly biometric). US store, with CCPA/CPRA obligations and GDPR if EU/UK shoppers are served. Fines and reputational damage. | Consent text, retention window, deletion flow, DPA with the AI provider, prohibition/guard on minors' photos. |
| **Virtual try-on quality and cost** | The feature is the product's differentiator but is expensive, slow and variable in quality. A poor result damages trust more than no feature. | Pick provider by evaluation; budget caps and rate limits; clear failure messaging; treat results as non-authoritative. |
| **Overselling stock** | Two shoppers buying the last unit breaks trust and creates support work. | Transactional stock reservation; concurrency test in the validation plan. |
| **AI inventing policies** | The chat assistant may state wrong shipping costs, return policies or prices. Direct customer-facing harm. | Implemented by `chat-assistant-guardrails`: deterministic policy/price/out-of-scope routing over `lib/chat/guardrails/store-knowledge.ts` and published catalog prices, a post-generation unverified-price guard, and explicit "I don't know" copy while policies are unpublished (ADR 0004). Shipping cost is now a verified policy; returns/payment/promotions remain `not_published`. Product composition, care, sizes, colors, stock and published body measurements are grounded in catalog rows; generic category, sizing and explicit product-info asks are answered deterministically, and missing measurements are stated as unpublished. |
| **Fit guidance exceeds the data** | The chart is approximate body measurements, not garment measurements or a fit prediction. Presenting it as "true to size" guidance could cause returns. | Clearly label the chart as approximate body measurements in inches and include the between-sizes disclaimer; no fit score, size recommendation or invented measurements. Per-garment measurements and fit prediction remain out of MVP scope. |
| **Payment simulation diverging from a real gateway** | Building against a fake gateway may not transfer to real card flows (3-D Secure, SCA, webhooks). | Keep `PaymentProvider` narrow and event-based; design for asynchronous confirmation now. |
| **Scope creep from rich design assets** | The designs imply more surface than the MVP budget (stylist cross-sell, fit prediction, returns, tracking, newsletter). | `mvp-scope.md` explicitly excludes them; treat the designs as direction, not a backlog. |
| **Unconfirmed pricing model** | Tax and currency assumptions drive totals, invoices and legal display. | Answer blocking question #2 before building pricing. |

## Research Tasks

- ~~Evaluate virtual try-on providers: quality, latency, cost per image, data retention and DPA terms.~~ Provider chosen 2026-10-19: DevExpert gateway image-edit behind `TryOnProvider` (see *Resolved*). Remaining: evaluate output quality/latency/cost per image and the provider's data-retention/DPA terms before public launch.
- ~~Evaluate LLM providers for the chat assistant: cost, latency, tool-calling for product data, data-handling terms.~~ Done 2026-10-14: first adapter is OpenAI Chat Completions behind `ChatAssistant` (see *Resolved*). Revisit cost/data-handling terms before public launch; guardrails behaviour is resolved by `chat-assistant-guardrails` (see *Resolved*).
- Confirm the legal requirements for selling online in the United States: sales tax registration and nexus, state sales tax rules, privacy policy (CCPA/CPRA where applicable), terms of sale, return policy disclosures, ADA website accessibility expectations.
- Decide the sign-in mechanism for passwordless accounts (magic link vs. email OTP vs. forced password).
- Decide object storage and signed-URL approach for try-on photos — deferred until blocking #3 is decided; the current slice stores nothing.
- Check whether a design system is required as tokens/components or whether the reference `DESIGN.md` is sufficient for the MVP.
