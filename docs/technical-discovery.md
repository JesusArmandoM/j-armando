# Technical Discovery

Project: **J. Armando**. Glossary terms are defined in `../CONTEXT.md`. Split out of `build-brief.md` because technology and integrations shape the solution.

## Product Surface

- **Web responsive**, single application: public storefront + admin backoffice.
  - Mobile (< 768px), tablet (768–1024px), desktop (> 1024px).
- No native mobile app, no public third-party API in the MVP.
- UI copy and documentation both in **English** (US market).

## Candidate Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Framework | **Next.js (App Router)** + **TypeScript** | One language for storefront, backoffice and API routes; good story for auth, payments and AI SDKs. |
| Database | **PostgreSQL** (managed) | Relational fit for products/variants/stock/orders; transactions for stock correctness. |
| ORM / access | **Drizzle ORM** (`drizzle-orm` + `drizzle-kit` over `pg`) | Decided in `bootstrap-database-schema`; see `adr/0002-drizzle-data-access-layer.md`. TypeScript-first schema, reviewable SQL migrations, swappable driver behind `DATABASE_URL`. |
| Styling | To be decided | Must be able to express the design system's zero-radius editorial language and its tokens. |
| AI | LLM provider behind `ChatAssistant`; external try-on service behind `TryOnProvider` | Both swappable and simulatable without touching store code. |

## Data and Storage

Relational core (see `domain-model.md` for relationships):

- `product`, `variant`, `stock`, `category`, `collection` (optional)
- `cart`, `cart_line`
- `order`, `order_line`, `payment`, `address`, `shipping_method`
- `account`, `role`
- `conversation`, `message`
- `try_on_session`, `photo`

Special storage considerations:

- **Photos for virtual try-on** are sensitive personal data. They must live in object storage with access control, never in the repo or in logs, and must have a retention/deletion rule.
- **Product imagery** is public and cacheable.
- **No data migration** is required: brand-new business, no existing catalog or customer data.

## Integrations

| Integration | Purpose | MVP status |
| --- | --- | --- |
| **LLM provider** (OpenAI / Anthropic / Google) | Chat Assistant | Real, behind `ChatAssistant`. |
| **Virtual try-on service** (specialised external provider) | Virtual Try-On | Real, behind `TryOnProvider`. |
| **Payment Provider** | Charge for orders | **Simulated** implementation of the same interface a real gateway would implement later. |
| **Object storage** (e.g. S3/R2-compatible) | Product images, try-on photos | Required. |
| **Email sending** | Order confirmation (and future magic links) | Required at least for order confirmation. |
| **Error tracking / logging** | Operations | Basic. |

A real payment gateway is deliberately deferred; the `PaymentProvider` interface must make that a drop-in change.

## Authentication and Authorization

- Account keyed by **unique email**; **password optional** at creation (Quick Access).
- **No email verification**, **no password recovery** in the MVP (explicit user decision).
- Separate `admin` role gating the backoffice.
- Sign-in mechanism for accounts without a password is **undecided** (magic link / email OTP / forced password creation). Highest-risk open question.
- Sessions: standard session/cookie policy for the framework. No OAuth, no social login.

## Deployment and Operations

- **Vercel** for the Next.js application.
- **Managed PostgreSQL** (Neon or Supabase).
- HTTPS and environment-based secrets; no secrets in the repository.
- Staging and production environments.
- Backups: rely on the managed database's backup policy.

## Testing and Verification

- Unit tests for domain rules: stock reservation, price/tax calculation, order state transitions, cart merge rules.
- Integration tests for checkout against a fake `PaymentProvider`, including the failure path.
- End-to-end tests for the first vertical slice in `mvp-scope.md` (browse → detail → cart → checkout → order history).
- Contract-level tests for `ChatAssistant` and `TryOnProvider` so a provider swap cannot silently break the UI.
- Load/concurrency check on the last-unit-in-stock scenario.

## Observability

- Structured application logs (no personal data, no photos, no secrets).
- Error tracking with source maps.
- Order and payment events logged as domain events for debugging failed checkouts.
- Basic metrics: checkout conversion steps, payment success/failure counts, try-on success/failure counts and latency, chat assistant latency.

## Constraints

- **Market/currency/tax**: **United States / USD**, with US sales tax **added at checkout** and calculated from the shipping address (state / ZIP). Catalog prices are tax-exclusive. Tax rates and economic-nexus rules are jurisdiction-dependent; the MVP needs only a simple configurable rate table, not a full tax engine.
- **Privacy**: US store. Uploaded photos are sensitive personal data. US state privacy laws (e.g. CCPA/CPRA in California) and, if EU/UK shoppers are served, GDPR may also apply. Consent, retention, deletion and a data-processing agreement with the AI providers are required before launch.
- **Budget/latency**: real AI providers cost per call. Try-on in particular is expensive and slow; rate limiting and cost caps may be needed.
- **Payment scope**: keeping payment simulated keeps PCI scope out of the MVP. Introducing a real gateway later adds PCI/3-D Secure obligations.
