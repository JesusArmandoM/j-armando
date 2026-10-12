# Risks and Open Questions

Project: **J. Armando**. Parent documents: `build-brief.md`, `mvp-scope.md`.

## Blocking Next Phase

These must be answered before implementation planning is final.

1. **Sign-in for accounts with no password.** Quick Access creates an account with an optional password. How does that customer reach their orders later: magic link, email OTP, or forced password creation on first return? This is the highest-risk gap in the identity model and blocks the auth design.
2. **Virtual try-on provider selection.** Which external service, with what quality, latency, cost and data-processing terms? Also: what happens to uploaded photos on their side (retention, training, deletion)?
3. **Photo consent and retention policy.** Legal basis, consent text, retention window, deletion mechanism, and whether photos of minors are prohibited. Privacy-critical for a US store and for any GDPR-covered shoppers.
4. **Chat Assistant scope and guardrails.** What may it answer (sizing, fabric, shipping, returns, policies)? What must it refuse? How do we stop it inventing shipping costs, return policies or prices?
5. **Shipping cost rules.** The designs show free standard shipping and a paid express option. Confirm the actual rules (flat rate, free above a threshold, weight-based).
6. **Sales tax rate table.** Sales tax is added at checkout and calculated from the shipping address. Which states/rates apply at launch, and do we need economic-nexus tracking beyond a simple configurable rate table?

## Implementation-Time Questions

- Styling approach capable of expressing the design system's zero-radius editorial language and token set.
- Cart merge rule when a guest signs in with an existing cart (union with quantity caps, or replace).
- Stock reservation strategy at checkout (reserve on add-to-cart vs. validate at payment) and reservation expiry.
- How a guest conversation or try-on session is attached to an account after sign-in.
- Email sending provider and templates (order confirmation is the only required one at launch).
- Object storage provider and access-control model for try-on photos.
- Admin authentication: same account model with an `admin` role, or a separate admin identity.
- Backoffice product data model details: composition, care, imagery per variant, SKU generation.
- Whether `pending` payment state is exposed to the shopper or collapsed to a single "processing" message.

## Resolved

- **ORM / data-access layer choice** — resolved 2026-10-12 by `bootstrap-database-schema`: **Drizzle ORM** (`drizzle-orm` + `drizzle-kit` over `pg`), with schema in `db/schema/` and committed SQL migrations in `db/migrations/`. See `adr/0002-drizzle-data-access-layer.md`. The managed provider (Neon vs Supabase) intentionally stays undecided — everything connects through `DATABASE_URL`.

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
| **AI inventing policies** | The chat assistant may state wrong shipping costs, return policies or prices. Direct customer-facing harm. | Constrain the assistant to a verified knowledge source; forbid inventing policy; test explicitly. |
| **Payment simulation diverging from a real gateway** | Building against a fake gateway may not transfer to real card flows (3-D Secure, SCA, webhooks). | Keep `PaymentProvider` narrow and event-based; design for asynchronous confirmation now. |
| **Scope creep from rich design assets** | The designs imply more surface than the MVP budget (stylist cross-sell, fit prediction, returns, tracking, newsletter). | `mvp-scope.md` explicitly excludes them; treat the designs as direction, not a backlog. |
| **Unconfirmed pricing model** | Tax and currency assumptions drive totals, invoices and legal display. | Answer blocking question #2 before building pricing. |

## Research Tasks

- Evaluate virtual try-on providers: quality, latency, cost per image, data retention and DPA terms.
- Evaluate LLM providers for the chat assistant: cost, latency, tool-calling for product data, data-handling terms.
- Confirm the legal requirements for selling online in the United States: sales tax registration and nexus, state sales tax rules, privacy policy (CCPA/CPRA where applicable), terms of sale, return policy disclosures, ADA website accessibility expectations.
- Decide the sign-in mechanism for passwordless accounts (magic link vs. email OTP vs. forced password).
- Decide object storage and signed-URL approach for try-on photos.
- Check whether a design system is required as tokens/components or whether the reference `DESIGN.md` is sufficient for the MVP.
