# J. Armando — Editorial Fashion Storefront, AI Tailoring & Backoffice

**J. Armando** is a production-grade clothing e-commerce platform built for the **United States market (`USD`)**. It pairs a restrained, zero-radius editorial storefront with a guest-first 3-step checkout that creates or links customer accounts at payment time, an atomic inventory reservation engine, a role-gated administrative backoffice, a deterministically guarded AI chat assistant, and a zero-persistence virtual try-on studio.

All **31 functional MVP features** (plus this documentation deliverable) are implemented, verified by an automated 99-file / 667-test suite over an ephemeral embedded PostgreSQL 17 instance, and independently validated under a Spec-Driven Development (SDD) multi-agent workflow.

---

## Table of Contents

1. [Executive Summary & Quick Links](#1-executive-summary--quick-links)
2. [Editorial Design System & Brand Philosophy](#2-editorial-design-system--brand-philosophy)
3. [Domain Rules, Actors & 31-Feature MVP Matrix](#3-domain-rules-actors--31-feature-mvp-matrix)
4. [Technology Stack, Toolchain & Library Inventory](#4-technology-stack-toolchain--library-inventory)
5. [Hexagonal (Ports & Adapters) Architecture](#5-hexagonal-ports--adapters-architecture)
6. [Complete Route & REST API Surface](#6-complete-route--rest-api-surface)
7. [AI Subsystems: Deterministic Guardrails, Try-On Privacy & 3-Tier Provider Resolution](#7-ai-subsystems-deterministic-guardrails-try-on-privacy--3-tier-provider-resolution)
8. [Guest-First Checkout, Atomic Stock Reservation & Identity Lifecycle](#8-guest-first-checkout-atomic-stock-reservation--identity-lifecycle)
9. [PostgreSQL 17 Data Layer: 17 Tables, 7 Enums, Migrations & Seeds](#9-postgresql-17-data-layer-17-tables-7-enums-migrations--seeds)
10. [Durable Engineering Constraints & Architecture Decision Records (ADRs)](#10-durable-engineering-constraints--architecture-decision-records-adrs)
11. [Local Quickstart, Verification Gate (`./init.sh`) & Multi-Agent SDD Workflow](#11-local-quickstart-verification-gate-initsh--multi-agent-sdd-workflow)

---

## 1. Executive Summary & Quick Links

### Core Highlights

- **US Market & Integer-Cent Money (`CONSTRAINTS.md` #1):** All prices, shipping fees, tax amounts, and order totals are stored and computed as integer cents (`bigint`) in `USD` (`char(3) = 'USD'`). Catalog prices are displayed **tax-exclusive**; destination-based US state sales tax is calculated at checkout via [`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts).
- **Guest-First Checkout with Account Creation at Payment Time:** Shoppers browse, manage their cart (`ja_cart_session` `httpOnly` cookie), and complete checkout without upfront registration. Upon a succeeded payment (`payment.succeeded`), the transaction atomically reserves variant stock (`UPDATE variant SET stock_qty = stock_qty - qty WHERE id = ? AND stock_qty >= qty`), freezes order lines, and creates or links the customer [`account`](db/schema/account.ts) by lowercase email (with an optional Quick Access `scrypt` password).
- **Password + Passwordless 6-Digit Email OTP Authentication:** Returning customers sign in at `/account/signin` using either their password (`node:crypto` `scrypt` + `timingSafeEqual`) or a single-use, 15-minute 6-digit numeric access code (`account_access_code`) delivered via the email port.
- **Hexagonal Ports & Adapters Isolation:** External capabilities sit behind four framework-agnostic ports — [`ChatAssistant`](lib/chat/chat-assistant.ts), [`TryOnProvider`](lib/try-on/try-on-provider.ts), [`PaymentProvider`](payments/payment-provider.ts), and [`EmailSender` / `OrderConfirmationEmailSender` / `AccessCodeEmailSender`](lib/email/email-service.ts) — so UI components and route handlers never depend on concrete vendor SDKs.
- **Deterministic AI Guardrails & Zero-Persistence Try-On Privacy:**
  - [`GuardedChatAssistant`](lib/chat/guarded-chat-assistant.ts) answers store policies ([`store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts)), published integer-cent prices, category synonyms, variant stock, and [`size_chart`](db/schema/catalog.ts) body measurements **deterministically without calling the LLM**, refuses out-of-scope or prompt-injection inputs, and strips any unverified dollar amounts from open-ended LLM responses via exact canonical set membership ([`answer-guard.ts`](lib/chat/guardrails/answer-guard.ts)).
  - Virtual Try-On (`POST /api/try-on`) enforces pre-flight validation ([`photo-validation.ts`](lib/try-on/photo-validation.ts): JPEG/PNG/WebP allowlist, `4 MiB` inclusive cap, magic-byte signature sniffing before any DB or provider call), bounds external requests with a `30 s` `AbortSignal.timeout`, and processes shopper photos strictly **in memory per request** (`Cache-Control: no-store`, zero DB tables, zero disk/object/browser storage, zero byte/URL logging).
- **Zero-Docker, Key-Free Verification Gate (`./init.sh`):** Running [`./init.sh`](init.sh) executes `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (which boots an ephemeral `embedded-postgres` 17 cluster per run and exercises AI/payment/email adapters offline via injected transport seams) and exits `0` without requiring Docker, a local PostgreSQL installation, or live API keys.

### Repository Documentation Index

| Document | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Agent operating instructions, command table, startup workflow, and mobile QR preview rule |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Toolchain pins, runtime surface, repository layout, data layer, and Hexagonal layering intent |
| [`CONSTRAINTS.md`](CONSTRAINTS.md) | 10 durable MUST / MUST NOT engineering rules enforced across all features |
| [`CONTEXT.md`](CONTEXT.md) | Ubiquitous domain language, canonical glossary, and rejected terms |
| [`DESIGN.md`](DESIGN.md) | Editorial visual direction, typography, color tokens, zero-radius geometry, and reference mapping |
| [`PROGRESS.md`](PROGRESS.md) | Current verified repository state and chronological session log (`Session 001`–`Session 048`) |
| [`feature_list.json`](feature_list.json) | Single source of truth for all 32 features, dependency DAG, verification criteria, and evidence |
| [`docs/build-brief.md`](docs/build-brief.md) | Problem statement, target actors, product goals, non-goals, and MVP validation criteria |
| [`docs/domain-model.md`](docs/domain-model.md) | Core entities, relationships, invariants, and state lifecycles |
| [`docs/user-and-access-model.md`](docs/user-and-access-model.md) | Guest, Customer, and Admin permission boundaries, session cookies, and photo privacy rules |
| [`docs/technical-discovery.md`](docs/technical-discovery.md) | Stack decisions, US/USD tax-exclusive market rules, AI provider strategy, and deployment target |
| [`docs/mvp-scope.md`](docs/mvp-scope.md) | Included MVP slices vs. explicitly excluded post-MVP capabilities |
| [`docs/risks-and-open-questions.md`](docs/risks-and-open-questions.md) | Resolved architectural questions and open pre-production privacy items |
| [`docs/adr/`](docs/adr/) | Accepted Architecture Decision Records ([`0001`](docs/adr/0001-standalone-git-repository.md)–[`0004`](docs/adr/0004-chat-assistant-guardrails.md)) |

---

## 2. Editorial Design System & Brand Philosophy

Defined in [`DESIGN.md`](DESIGN.md) and implemented in [`app/globals.css`](app/globals.css), the **J. Armando** aesthetic fuses haute-couture editorial restraint with quiet computational intelligence:

### Visual & Geometric Principles

1. **Zero-Radius Rectilinear Geometry:** Every card, button, input, modal, badge, table, and panel enforces `border-radius: 0px` (`90-degree` architectural corners mirroring textile bolts and print layouts). The **only** permitted circular exceptions are AI status pips and color swatch chips.
2. **Hairline Structural Framing:** `1px solid` hairline dividers and tonal layering replace drop shadows and heavy borders.
3. **Quiet AI Surfaces:** Generative features (Chat Assistant & Virtual Try-On) render as discreet, slate-steel bespoke tailoring surfaces rather than novelty popups.

### Typography & Color Tokens

| Token / Role | Value / Font | Usage |
| --- | --- | --- |
| **Editorial Heading Serif** | `Newsreader` (regular & italic; never bold) | Page titles, hero statements, garment titles, order confirmation headers |
| **Functional Geometric Sans** | `Hanken Grotesk` (`400`, `500`, `600`) | Body copy, navigation, pricing, size charts, SKU tables, form controls, AI metadata |
| **Primary / Ink** | `#121212` (Deep Charcoal Ink) | Primary typography, structural frames, primary buttons (never pure `#000000`) |
| **Neutral / Canvas** | `#F9F8F5` (Warm Ivory Alabaster) | Page background canvas that enhances fabric photography without harsh glare |
| **Secondary / Stone** | `#6E6A63` / `#E5E2DC` | Metadata, secondary labels, hairline structural dividers |
| **Tertiary / AI Accent** | `#4A5568` (Slate Steel) | Virtual Try-On studio, Chat Assistant surfaces, and algorithmic status indicators |

### Design Reference Adaptation (`stitch_image_based_application/`)

The directory `stitch_image_based_application/` contains early visual proposals (`LUMEN Atelier`). Per [`AGENTS.md`](AGENTS.md) and [`DESIGN.md`](DESIGN.md):
- All `LUMEN` branding is replaced by **J. Armando**.
- All Spanish reference copy, EUR (`€`) prices, and IVA-inclusive tax labels are replaced by **English copy**, **`USD` (`$`) integer-cent formatting**, and **tax-exclusive catalog pricing** with separate US state sales tax at checkout.
- Out-of-scope reference widgets (**AI Stylist cross-sell**, **FITIQ fit predictor**, **newsletter footer**, **self-service returns portal**, **live card gateway**) are intentionally excluded per [`docs/mvp-scope.md`](docs/mvp-scope.md).

---

## 3. Domain Rules, Actors & 31-Feature MVP Matrix

### Actor & Role Permissions Matrix

Per [`docs/user-and-access-model.md`](docs/user-and-access-model.md):

| Capability | Guest (`ja_cart_session`) | Customer (`ja_account_session`, role `customer`) | Admin (`ja_account_session`, role `admin`) |
| --- | :---: | :---: | :---: |
| Browse `/catalog`, filter/sort, view `/products/[slug]` & size charts | Yes | Yes | Yes |
| Add/edit/remove cart lines (`/cart`, `1..10` per line, clamped to stock) | Yes | Yes | Yes |
| Use Guarded Chat Assistant (`POST /api/chat`) & Virtual Try-On (`POST /api/try-on`) | Yes | Yes | Yes |
| Complete 3-step checkout (`/checkout`) & view order confirmation | Yes (creates/links Account on pay) | Yes (links order to Account) | Yes |
| Sign in via Password or 6-digit Email OTP (`/account/signin`) | Creates session | Yes | Yes |
| View `/account`, `/account/orders`, and own `/account/orders/[reference]` | Redirects to `/account/signin` | Yes (own orders only) | Yes (own orders in `/account`) |
| Access `/admin*` backoffice & `/api/admin/*` endpoints | `401 Unauthorized` | `403 Forbidden` | Yes (`getAdminSession()`) |
| Create draft products/variants, publish/archive products (`/admin/products*`) | No | No | Yes |
| List all customer orders & advance fulfillment (`/admin/orders*`) | No | No | Yes |

### Complete 32-Feature Inventory (`feature_list.json`)

Every functional slice in [`feature_list.json`](feature_list.json) has its own specification in `docs/specs/` and independent validation report in `docs/validations/`:

| # | Feature ID | Area | Title & Shipped Behavior | Status |
| --- | --- | --- | --- | --- |
| 1 | `bootstrap-app-skeleton` | `bootstrap` | Next.js 16.4 + React 19.3 + TypeScript shell, editorial tokens, Vitest `ui` project, non-blocking `./init.sh` gate | `accepted` |
| 2 | `bootstrap-database-schema` | `bootstrap` | Drizzle ORM + PostgreSQL 17 schema, migrations, idempotent demo seed (`6` categories, `9` products, `40` variants, `16` SVGs), `embedded-postgres` harness | `accepted` |
| 3 | `catalog-product-listing` | `catalog` | Responsive 1/2/4-column grid of `published` products with tax-exclusive USD prices (`formatPriceUSD`) | `accepted` |
| 4 | `catalog-filtering` | `catalog` | URL-driven filtering (`category`, `size`, `color`, `maxPrice`) and sorting (`newest`, `price-asc`, `price-desc`, `name`) | `accepted` |
| 5 | `product-detail-page` | `catalog` | Asymmetric 3:2 gallery/commentary detail page (`/products/[slug]`), composition/care, 404 for `draft`/`archived`/unknown slugs | `accepted` |
| 6 | `product-variant-selection` | `catalog` | Interactive size/color matrix selector (`?size=&color=`), derived stock availability (`available` / `out_of_stock`), variant price override display | `accepted` |
| 7 | `guest-cart-add` | `shopping` | `POST /api/cart/lines` & `/cart` view with opaque `httpOnly` `ja_cart_session` cookie identity | `accepted` |
| 8 | `guest-cart-manage` | `shopping` | Interactive quantity steppers (`PATCH /api/cart/lines`) and line removal (`DELETE /api/cart/lines`) with instant integer-cent subtotal recalculation | `accepted` |
| 9 | `cart-stock-limits` | `shopping` | Server and UI enforcement of available `stockQty` caps on cart add, quantity edit, and out-of-stock reconciliation | `accepted` |
| 10 | `checkout-contact-and-address` | `checkout` | Step 1 of `/checkout`: contact email and US shipping address (`state`, 5/9-digit `zip`) persisted to `checkout_session` | `accepted` |
| 11 | `checkout-shipping-method` | `checkout` | Step 2 of `/checkout`: selection between Standard (`$0.00`, 3–5 business days) and Express (`$15.00`, 1–2 business days) | `accepted` |
| 12 | `checkout-sales-tax` | `checkout` | Destination-based US state sales tax calculation ([`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts)) across all 50 states + DC | `accepted` |
| 13 | `payment-provider-abstraction` | `payments` | Framework-agnostic `PaymentProvider` port, `SimulatedPaymentProvider` (`succeed`/`fail`/`pending`), and `describePaymentOutcome` mapper | `accepted` |
| 14 | `order-creation-on-payment` | `orders` | Step 3 `POST /api/checkout/pay`: creates `paid` order (`JA-XXXXXX`) with frozen `order_line` snapshots and `/checkout/confirmation/[reference]` | `accepted` |
| 15 | `payment-failure-path` | `payments` | Declined/failed simulated payments create no paid order, preserve cart & stock, and allow in-place retry | `accepted` |
| 16 | `stock-reservation` | `inventory` | Atomic conditional SQL stock decrement (`stock_qty >= qty`) sorted by `variantId` so concurrent checkouts never oversell the last unit | `accepted` |
| 17 | `account-created-at-payment` | `identity` | Succeeded payment automatically creates or links `account` + `customer` role by lowercase email and links `order.accountId` | `accepted` |
| 18 | `account-quick-access-password` | `identity` | Optional Quick Access password field at checkout hashed with `scrypt` (`lib/auth/password.ts`) and saved on the created/linked account | `accepted` |
| 19 | `account-signin-signout` | `identity` | Customer sign-in (`/account/signin`) via password or single-use 6-digit email OTP (`account_access_code`) + `ja_account_session` lifecycle | `accepted` |
| 20 | `order-history` | `orders` | Authenticated customer order list (`/account/orders`) and detail (`/account/orders/[reference]`) isolated strictly to the signed-in account | `accepted` |
| 21 | `order-confirmation-email` | `notifications` | Non-blocking order confirmation email (`OrderConfirmationEmailSender`) dispatched upon `paid` order creation | `accepted` |
| 22 | `admin-role-gate` | `backoffice` | Server-side `getAdminSession()` guard protecting `/admin*` pages and `/api/admin/*` endpoints (`401`/`403`) + seeded admin account | `accepted` |
| 23 | `admin-product-create` | `backoffice` | Admin product list (`/admin/products`), creation form (`/admin/products/new`), and detail (`/admin/products/[id]`) with SKU & per-variant stock | `accepted` |
| 24 | `admin-product-publish` | `backoffice` | Admin product status transitions (`draft` <-> `published` <-> `archived`) controlling storefront catalog & detail visibility | `accepted` |
| 25 | `admin-order-list` | `backoffice` | Admin order list (`/admin/orders`) and detail (`/admin/orders/[reference]`) across all customers with financial & line snapshots | `accepted` |
| 26 | `admin-order-fulfillment` | `backoffice` | Sequential fulfillment progression (`unfulfilled` -> `preparing` -> `shipped` -> `delivered`) for paid orders, reflected in customer views | `accepted` |
| 27 | `chat-assistant` | `ai` | Storefront Chat Assistant panel (`app/chat/chat-panel.tsx`) and `POST /api/chat` behind the `ChatAssistant` port | `accepted` |
| 28 | `chat-assistant-guardrails` | `ai` | `GuardedChatAssistant` decorator: deterministic policy/price/catalog answers, prompt-injection refusal, and unverified dollar-amount stripping | `accepted` |
| 29 | `virtual-tryon-generation` | `ai` | Product-page Virtual Try-On studio (`app/products/[slug]/try-on-panel.tsx`) & `POST /api/try-on` with zero-persistence in-memory privacy | `accepted` |
| 30 | `catalog-size-chart` | `catalog` | Category `size_chart` table (`30` seeded rows across `XS`–`XL`), product-page size guide table, and deterministic chat measurement answers | `accepted` |
| 31 | `virtual-tryon-failure` | `ai` | Pre-flight `4 MiB` / JPEG-PNG-WebP / magic-byte validation (`400 invalid_photo`), `30 s` `AbortSignal.timeout` (`504`), and same-photo retry | `accepted` |
| 32 | `repository-readme` | `documentation` | Comprehensive root `README.md` with architecture, stack, libraries, AI systems, 17-table schema, and 6 Mermaid diagrams | `passing` |

---

## 4. Technology Stack, Toolchain & Library Inventory

All toolchain versions and package dependencies are pinned in [`.nvmrc`](.nvmrc) and [`package.json`](package.json).

### Runtime & Toolchain Pins

| Tool | Pinned Version | Management & Architectural Role |
| --- | --- | --- |
| **Node.js** | `v24.21.0` (`>=24.0.0`) | Managed via `nvm` ([`.nvmrc`](.nvmrc)). Executes `db/*.ts` CLI scripts directly using Node 24's built-in `--experimental-strip-types` (erasable TypeScript syntax without `tsx` or `ts-node`). |
| **pnpm** | `12.11.2` | Managed via Corepack (`"packageManager": "pnpm@12.11.2"`). Enforces deterministic lockfile installs (`pnpm install --frozen-lockfile`). |
| **TypeScript** | `^5` (`5.9.3`) | Strict static typechecking (`tsc --noEmit`) with `allowImportingTsExtensions` enabled for Node 24 native type-stripping. |
| **PostgreSQL** | `17` | Primary relational database storing catalog, cart, checkout, order, payment, and identity tables in integer cents (`bigint`). |

### Production Dependencies (`dependencies` in `package.json`)

| Package | Version | Architectural Role |
| --- | --- | --- |
| `next` | `16.4.0` | App Router framework with React Server Components (RSC), Turbopack builds, dynamic Route Handlers, and Next 16 async `params` / `searchParams` (`Promise<...>`). |
| `react` | `19.3.0` | Server and Client Component rendering primitives (`useState`, `useEffect`, `useId`, transitions). |
| `react-dom` | `19.3.0` | DOM bindings and server-side streaming HTML renderer for React 19. |
| `drizzle-orm` | `^0.45.4` | Type-safe SQL query builder and schema DSL (`pgTable`, `pgEnum`, transactional repositories in `db/`). Selected in [ADR 0002](docs/adr/0002-drizzle-data-access-layer.md). |
| `pg` | `^8.23.1` | Node-postgres connection pool driver backing Drizzle ORM via `DATABASE_URL` ([`db/client.ts`](db/client.ts)). |

### Development & Verification Dependencies (`devDependencies` in `package.json`)

| Package | Version | Architectural Role |
| --- | --- | --- |
| `drizzle-kit` | `0.31.11` | Schema diffing and SQL migration generator (`pnpm db:generate`) and migration runner (`pnpm db:migrate`) configured in [`drizzle.config.ts`](drizzle.config.ts). |
| `embedded-postgres` | `17.10.0-beta.17` | Boots real, disposable PostgreSQL 17 binaries in user space for automated DB integration tests ([`db/tests/global-setup.ts`](db/tests/global-setup.ts)) and local Docker-free dev (`pnpm db:devdb`). |
| `vitest` | `^5.0.3` | Test runner configured in [`vitest.config.mts`](vitest.config.mts) with two isolated projects: `ui` (`jsdom`) and `db` (`node`, parallel per-file PostgreSQL databases). |
| `@testing-library/react` | `^16.3.3` | Component rendering and user-centric DOM testing for Client and Server Components in the `ui` Vitest project. |
| `@testing-library/dom` | `^10.4.2` | Accessible query primitives (`getByRole`, `getByLabelText`, `getByTestId`) used across UI tests. |
| `jsdom` | `^30.1.2` | Browser DOM environment for the `ui` Vitest project (`globals: true` enabled for automatic `afterEach` cleanup). |
| `@vitejs/plugin-react` | `^6.1.2` | JSX/TSX transform plugin for Vitest 5. |
| `eslint` | `^9` (`9.39.5`) | Flat-config static linter ([`eslint.config.mjs`](eslint.config.mjs)). |
| `eslint-config-next` | `16.4.0` | Next.js 16 and React 19 ESLint ruleset (`core-web-vitals` + TypeScript). |
| `typescript` | `^5` (`5.9.3`) | TypeScript compiler (`tsc --noEmit`) with `allowImportingTsExtensions` for Node 24 native type-stripping. |
| `@types/node` | `^24` | Node 24 type definitions (aligned with `vitest@5` peer requirements of `^22 \|\| >=24`). |
| `@types/pg` | `^8.23.1` | TypeScript definitions for `pg`. |
| `@types/react` / `@types/react-dom` | `^19` | TypeScript definitions for React 19. |

### Built-In Node.js Primitives (Zero External SDKs for Auth & AI)

To keep the dependency footprint minimal and auditable, authentication and AI provider communication use built-in Node 24 primitives instead of heavy vendor SDKs:
- **`node:crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`):** Powers password hashing (`<saltHex>:<keyHex>` in [`lib/auth/password.ts`](lib/auth/password.ts)), opaque 32-byte `base64url` session tokens (`ja_cart_session`, `ja_account_session`), and cryptographically random 6-digit OTP access codes.
- **`node:crypto` (`createSign("RSA-SHA256")`):** Signs RS256 OAuth2 JWT assertions in [`lib/ai/google-auth.ts`](lib/ai/google-auth.ts) to exchange `gcp-service-account.json` credentials for short-lived Google Cloud Vertex AI bearer tokens without installing `@google-cloud/vertexai` or `google-auth-library`.
- **Native `fetch` + `AbortSignal.timeout`:** Powers all HTTP calls to Vertex AI, Google Gemini API, and OpenAI / DevExpert endpoints, accepting an injectable `fetch` seam for deterministic offline testing.

---

## 5. Hexagonal (Ports & Adapters) Architecture

### Dependency Rule

Code dependencies point strictly inward toward domain contracts and data repositories:

```text
app/ (Next.js Pages, Client Components & Route Handlers)
  │
  ├──► lib/ & payments/ (Framework-Agnostic Domain Ports, Guardrail Decorators & Pure Mappers)
  │      └──► Concrete Adapters (Vertex AI, Gemini API, OpenAI/DevExpert, Simulated Payment, Simulated Email)
  │
  └──► db/ (Drizzle Repositories & Atomic Transactions)
         └──► PostgreSQL 17 (17 Tables, 7 pgEnums)
```

- Modules in [`payments/`](payments/) and [`lib/`](lib/) (`lib/money.ts`, `lib/tax/sales-tax.ts`, `lib/chat/`, `lib/try-on/`, `lib/email/`) do **not** import `next`, `react`, or `db/` directly. Where a decorator needs catalog facts (such as `GuardedChatAssistant`), it receives a narrow callback interface (`CatalogFactReader`) wired at the composition root ([`app/api/chat/composition.ts`](app/api/chat/composition.ts)).

### Diagram 1: High-Level System & Hexagonal Ports-and-Adapters Architecture

```mermaid
flowchart TB
  subgraph Client["Browser Client (Shopper & Admin)"]
    StorefrontUI["Storefront UI (/catalog, /products/[slug], /cart, /checkout)"]
    AccountUI["Customer Portal (/account, /account/signin, /account/orders)"]
    AdminUI["Admin Backoffice (/admin/products, /admin/orders)"]
    ChatUI["ChatPanel + TryOnPanel (Client Components)"]
  end

  subgraph AppLayer["Next.js 16.4 App Router (app/)"]
    RSC["Server Components (RSC Pages)"]
    APIRoutes["REST Route Handlers (/api/cart, /api/checkout, /api/auth, /api/admin, /api/chat, /api/try-on)"]
    ChatComp["Composition Root (app/api/chat/composition.ts)"]
  end

  subgraph DomainPorts["Hexagonal Ports & Domain Services (lib/ & payments/)"]
    ChatGuard["GuardedChatAssistant Decorator + Store Knowledge & Answer Guard"]
    ChatPort["Port: ChatAssistant (lib/chat/chat-assistant.ts)"]
    TryOnVal["Pre-Flight Photo Validator (4 MiB, JPEG/PNG/WebP, Magic Bytes)"]
    TryOnPort["Port: TryOnProvider (lib/try-on/try-on-provider.ts)"]
    PayPort["Port: PaymentProvider (payments/payment-provider.ts)"]
    EmailPort["Port: EmailSender / OrderConfirmation & AccessCode (lib/email/)"]
    TaxMoney["Pure Domain Helpers (lib/money.ts, lib/tax/sales-tax.ts)"]
  end

  subgraph Adapters["Concrete Adapters (Swappable Behind Ports)"]
    VertexAdapters["Tier 1: VertexChatAssistant & VertexTryOnProvider (RS256 JWT)"]
    GeminiAdapters["Tier 2: GeminiChatAssistant & GeminiTryOnProvider (GEMINI_API_KEY)"]
    OpenAiAdapters["Tier 3: OpenAiChatAssistant & OpenAiImagesTryOnProvider + SimulatedTryOnProvider"]
    SimPayAdapter["SimulatedPaymentProvider (succeed | fail | pending)"]
    SimEmailAdapter["SimulatedEmailSender & SimulatedAccessCodeEmailSender"]
  end

  subgraph DataLayer["Drizzle ORM Data Layer (db/)"]
    Repos["Repositories (catalog, cart, checkout, order, auth, admin-products, admin-orders)"]
    PG[("PostgreSQL 17 (17 Tables & 7 Enums)")]
  end

  StorefrontUI --> RSC
  AccountUI --> RSC
  AdminUI --> RSC
  StorefrontUI --> APIRoutes
  AccountUI --> APIRoutes
  AdminUI --> APIRoutes
  ChatUI --> APIRoutes

  RSC --> Repos
  RSC --> TaxMoney
  APIRoutes --> Repos
  APIRoutes --> ChatComp
  APIRoutes --> TryOnVal
  APIRoutes --> PayPort
  APIRoutes --> EmailPort

  ChatComp --> ChatGuard
  ChatGuard --> ChatPort
  ChatGuard --> Repos
  TryOnVal --> TryOnPort

  ChatPort --> VertexAdapters
  ChatPort --> GeminiAdapters
  ChatPort --> OpenAiAdapters

  TryOnPort --> VertexAdapters
  TryOnPort --> GeminiAdapters
  TryOnPort --> OpenAiAdapters

  PayPort --> SimPayAdapter
  EmailPort --> SimEmailAdapter
  Repos --> PG
```

### The Four Realised Ports & Their Adapters

| Port Interface | Location | Decorator / Mapper | Concrete Adapters |
| --- | --- | --- | --- |
| **`ChatAssistant`** | [`lib/chat/chat-assistant.ts`](lib/chat/chat-assistant.ts) | [`GuardedChatAssistant`](lib/chat/guarded-chat-assistant.ts) (`lib/chat/guardrails/*`) | 1. [`VertexChatAssistant`](lib/chat/vertex-chat-assistant.ts) (`gemini-2.5-flash` via Vertex AI)<br>2. [`GeminiChatAssistant`](lib/chat/gemini-chat-assistant.ts) (`gemini-3.8-flash` / `gemini-2.5-flash`)<br>3. [`OpenAiChatAssistant`](lib/chat/openai-chat-assistant.ts) (`gpt-4o-mini` or compatible gateway) |
| **`TryOnProvider`** | [`lib/try-on/try-on-provider.ts`](lib/try-on/try-on-provider.ts) | [`photo-validation.ts`](lib/try-on/photo-validation.ts) + [`prompt.ts`](lib/try-on/prompt.ts) | 1. [`VertexTryOnProvider`](lib/try-on/vertex-try-on-provider.ts) (`gemini-2.5-flash-image` via Vertex AI)<br>2. [`GeminiTryOnProvider`](lib/try-on/gemini-try-on-provider.ts) (`gemini-3.1-flash-image` / `gemini-2.5-flash-image`)<br>3. [`OpenAiImagesTryOnProvider`](lib/try-on/openai-images-try-on-provider.ts) (`POST {baseUrl}/images/edits`, `30 s` timeout)<br>4. [`SimulatedTryOnProvider`](lib/try-on/simulated-try-on-provider.ts) (deterministic SVG preview) |
| **`PaymentProvider`** | [`payments/payment-provider.ts`](payments/payment-provider.ts) | [`describePaymentOutcome`](payments/payment-outcome.ts) (`payments/payment-outcome.ts`) | [`SimulatedPaymentProvider`](payments/simulated-provider.ts) (`createSimulatedPaymentProvider`: deterministic `succeed`, `fail`, and `pending` events with `sim_<reference>`) |
| **`OrderConfirmationEmailSender` & `AccessCodeEmailSender`** | [`lib/email/email-service.ts`](lib/email/email-service.ts) | `renderOrderConfirmationText` / `renderOrderConfirmationHtml` & `renderAccessCodeText` / `renderAccessCodeHtml` | [`SimulatedEmailSender`](lib/email/order-confirmation.ts) ([`lib/email/order-confirmation.ts`](lib/email/order-confirmation.ts)) & [`SimulatedAccessCodeEmailSender`](lib/email/access-code.ts) ([`lib/email/access-code.ts`](lib/email/access-code.ts)) |

### Repository Directory Layout

```text
.
├── app/                                  # Next.js 16.4 App Router pages, client components & API routes
│   ├── layout.tsx                        # Root layout (Newsreader + Hanken Grotesk fonts, global <ChatPanel />)
│   ├── page.tsx                          # Editorial landing page (/)
│   ├── globals.css                       # Zero-radius design tokens & component styles
│   ├── catalog/                          # /catalog grid, product-card, filter-bar & URL filter-params
│   ├── products/[slug]/                  # /products/[slug] detail, gallery, variant-selector, size-guide, add-to-cart, try-on-panel
│   ├── cart/                             # /cart session view, cart-items client stepper, cookie helpers & input validation
│   ├── checkout/                         # /checkout 3-step flow, payment-outcome surface & /checkout/confirmation/[reference]
│   ├── account/                          # /account overview, /account/signin (Password + OTP tabs), /account/orders & [reference]
│   ├── admin/                            # /admin dashboard, /admin/products (list, new, [id]) & /admin/orders (list, [reference])
│   ├── chat/                             # Floating/drawer storefront Chat Assistant client component
│   └── api/                              # REST Route Handlers (cart, checkout, auth, account, admin, chat, try-on)
├── db/                                   # Drizzle ORM data layer over PostgreSQL 17
│   ├── schema/                           # 17 tables & 7 pgEnums (enums.ts, catalog.ts, account.ts, cart.ts, order.ts, index.ts)
│   ├── migrations/                       # 7 committed SQL migrations (0000_bumpy_lifeguard .. 0006_fresh_zombie)
│   ├── tests/                            # Ephemeral embedded-postgres globalSetup, per-file DB harness & 25 DB test suites
│   ├── catalog.ts                        # Published product queries, filters, size charts & try-on garment context
│   ├── cart.ts                           # Guest cart repository, stock cap clamping & session summary
│   ├── checkout.ts                       # Checkout session repository (contact/address, shipping method, quick-access password)
│   ├── order.ts                          # Transactional order creation, atomic stock decrement, account linking & order history
│   ├── auth.ts                           # Password auth, session lifecycle, 6-digit OTP generation/verification & admin role check
│   ├── admin-products.ts                 # Backoffice product/variant creation & draft/published/archived status transitions
│   ├── admin-orders.ts                   # Backoffice order listing, detail & sequential fulfillment state machine
│   ├── seed.ts & seed-data.ts            # Idempotent insert-if-missing demo catalog, shipping methods & admin account seed
│   ├── verify.ts                         # CLI catalog population verifier (pnpm db:verify)
│   └── devdb.ts                          # Disposable local embedded PostgreSQL 17 runner (pnpm db:devdb)
├── lib/                                  # Framework-agnostic application ports, domain services & guardrails
│   ├── ai/google-auth.ts                 # Zero-SDK RS256 JWT signer & token cache for Google Cloud Vertex AI
│   ├── auth/                             # scrypt password hashing (password.ts), session cookie helpers & getAdminSession
│   ├── chat/                             # ChatAssistant port, Vertex/Gemini/OpenAI adapters, GuardedChatAssistant & guardrails/
│   ├── try-on/                           # TryOnProvider port, Vertex/Gemini/OpenAI/Simulated adapters, photo-validation & prompt
│   ├── email/                            # Order confirmation & 6-digit OTP access-code email ports, templates & simulated senders
│   ├── tax/sales-tax.ts                  # Destination-based US state sales tax rate table & integer-cent calculator
│   └── money.ts                          # Pure integer-cent to USD string formatter (formatPriceUSD)
├── payments/                             # Framework-agnostic PaymentProvider port, SimulatedPaymentProvider & outcome mapper
├── public/images/products/               # 16 editorial 3:4 SVG garment placeholders referenced by seed-data.ts
├── docs/                                 # Product discovery docs, ADRs (docs/adr/), feature specs (docs/specs/) & validations
├── stitch_image_based_application/       # Visual design reference proposals only (NOT specification)
├── init.sh                               # Non-blocking verification gate (install + lint + typecheck + test)
├── feature_list.json                     # Source of truth for all 32 features, dependencies & verification evidence
└── PROGRESS.md                           # Verified repository state & session log
```

---

## 6. Complete Route & REST API Surface

### Storefront, Customer Account & Admin Backoffice Pages

| Route Path | Rendering | Access Guard | Responsibility |
| --- | --- | --- | --- |
| `/` | Static (`○`) | Public | Editorial landing page introducing **J. Armando** with direct entry to `/catalog`. |
| `/catalog` | Dynamic (`ƒ`) | Public | Published product grid with URL-driven filters (`category`, `size`, `color`, `maxPrice`) and sorting (`newest`, `price-asc`, `price-desc`, `name`). |
| `/products/[slug]` | Dynamic (`ƒ`) | Public | Product detail page (`3:2` editorial split): image gallery, `formatPriceUSD` tax-exclusive price, size/color variant selector, category size guide table, Add-to-Cart control, and Virtual Try-On studio. Returns `404` for `draft`, `archived`, or unknown slugs. |
| `/cart` | Dynamic (`ƒ`) | Public (`ja_cart_session`) | Session guest cart with quantity steppers (`1..10`, capped by `stockQty`), line removal, stock reconciliation alerts, integer-cent subtotal, and link to `/checkout`. Reads never mint a cookie. |
| `/checkout` | Dynamic (`ƒ`) | Public (`ja_cart_session`) | 3-step guest-first checkout: (1) Contact Email, US Shipping Address & optional Quick Access password, (2) Shipping Method (`Standard $0.00` / `Express $15.00`), (3) US State Sales Tax summary & Simulated Payment (`succeed` / `fail`). |
| `/checkout/confirmation/[reference]` | Dynamic (`ƒ`) | Public (`ja_cart_session` / reference) | Post-purchase confirmation displaying order reference (`JA-XXXXXX`), frozen line items, delivery address, shipping method, tax breakdown, and account creation/linking status. |
| `/account/signin` | Dynamic (`ƒ`) | Public (redirects if signed in) | Dual-tab customer authentication portal: **Password Sign-In** and **6-Digit Email Access Code (OTP)** sign-in. Supports `?returnUrl=` redirect. |
| `/account` | Dynamic (`ƒ`) | Authenticated (`ja_account_session`) | Customer account overview displaying verified email, assigned roles, quick link to `/account/orders` (and `/admin` if admin), and Sign Out action. |
| `/account/orders` | Dynamic (`ƒ`) | Authenticated (`ja_account_session`) | Customer order history listing all paid orders belonging to the signed-in account (newest first) with status and fulfillment badges. |
| `/account/orders/[reference]` | Dynamic (`ƒ`) | Authenticated (Owner only) | Customer order detail showing frozen line snapshots, shipping address, payment total, and live fulfillment status (`unfulfilled` -> `delivered`). Returns `404` if reference belongs to another customer. |
| `/admin` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Backoffice dashboard linking to Product Catalog Management (`/admin/products`) and Order Fulfillment Management (`/admin/orders`). |
| `/admin/products` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Backoffice catalog table across all statuses (`draft`, `published`, `archived`) with base price, variant count, total stock, and `+ New Product` CTA. |
| `/admin/products/new` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Transactional creation form for a new `draft` product with dynamic size/color/hex/stock variant rows. |
| `/admin/products/[id]` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Backoffice product detail with variant SKU/stock inventory table and status lifecycle controls (`Publish Product`, `Archive Product`, `Revert to Draft`). |
| `/admin/orders` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Global order list across all customers with reference, customer email, item count, order/fulfillment badges, and USD total. |
| `/admin/orders/[reference]` | Dynamic (`ƒ`) | Admin (`getAdminSession`) | Global order detail with frozen lines, customer delivery snapshot, financial breakdown, and interactive sequential fulfillment controls. |

### REST API Endpoints (`app/api/**`)

All mutating and sensitive endpoints set `Cache-Control: no-store`.

| Endpoint | Methods | Auth / Identity | Request Contract & Response Semantics |
| --- | --- | --- | --- |
| `/api/cart/lines` | `POST`, `PATCH`, `DELETE` | `ja_cart_session` (`httpOnly` cookie) | `POST { variantId, quantity }` adds 1–10 units (mints cookie on first add; `400` if unavailable or `> stockQty`). `PATCH { lineId, quantity }` updates line quantity (`400` if `> stockQty`, `404` if wrong cart). `DELETE { lineId }` removes line. |
| `/api/checkout/contact-and-address` | `GET`, `POST` | `ja_cart_session` | `POST { email, recipientName, line1, line2, city, state, zip, country, phone, password? }` validates US 2-letter state, 5/9-digit ZIP, and optional Quick Access password (`>= 8` chars, letter + digit), upserting `checkout_session`. |
| `/api/checkout/shipping-method` | `POST` | `ja_cart_session` | `POST { shippingMethodId }` attaches a valid `shipping_method` (`standard` or `express`) to the active `checkout_session` and returns updated subtotal/shipping/tax/total cents. |
| `/api/checkout/pay` | `POST` | `ja_cart_session` | `POST { cardToken, paymentScenario? }` runs `PaymentProvider.createPayment`. On `payment.succeeded`, atomically decrements variant stock, creates `paid` order + `order_line`s, creates/links `account`, converts cart, and dispatches confirmation email (`200 { ok: true, orderReference }`). On `payment.failed`, returns `402` and preserves cart/stock. On stock exhaustion, returns `409 out_of_stock`. |
| `/api/auth/signin` | `POST` | Public | `POST { email, password }` verifies `scrypt` hash, creates `account_session`, sets `ja_account_session` cookie (`200 { ok: true, account }`, or `401` on invalid credentials). |
| `/api/auth/request-code` | `POST` | Public | `POST { email }` generates a 6-digit numeric OTP in `account_access_code` (15-min expiry) and sends it via `AccessCodeEmailSender` (`200 { ok: true }`, or `404` if account not found). |
| `/api/auth/verify-code` | `POST` | Public | `POST { email, code }` verifies and consumes (deletes) the single-use 6-digit OTP, creates `account_session`, and sets `ja_account_session` (`200 { ok: true, account }`, or `400` if invalid/expired). |
| `/api/auth/signout` | `POST` | `ja_account_session` | Deletes active row in `account_session` and clears `ja_account_session` cookie (`200 { ok: true }`). |
| `/api/auth/me` | `GET` | `ja_account_session` | Returns `{ authenticated: true, account: { id, email, roles } }` or `{ authenticated: false }`. |
| `/api/account/orders` | `GET` | `ja_account_session` | Returns authenticated customer's paid orders (`401` if unauthenticated). |
| `/api/account/orders/[reference]` | `GET` | `ja_account_session` | Returns authenticated customer's order detail for `reference` (`401` if unauthenticated, `404` if not found or owned by another account). |
| `/api/admin/check` | `GET` | `getAdminSession` | Verifies admin access (`200 { ok: true, admin }` for admins, `401` unauthenticated, `403` non-admin customer). |
| `/api/admin/products` | `GET`, `POST` | `getAdminSession` | `GET` lists all products across statuses. `POST` validates input (`validateAdminProductInput`) and transactionally creates a `draft` product + variants (`201`). |
| `/api/admin/products/[id]/status` | `PATCH`, `POST` | `getAdminSession` | `PATCH/POST { status }` transitions product between `draft`, `published`, and `archived` (`200`, `400` invalid status, `404` unknown ID) and revalidates storefront paths. |
| `/api/admin/orders` | `GET` | `getAdminSession` | Lists all orders across all customers with line counts and payment/fulfillment statuses (`200`). |
| `/api/admin/orders/[reference]` | `GET` | `getAdminSession` | Returns full order detail for any customer order by `reference` (`200`, `404` unknown reference). |
| `/api/admin/orders/[reference]/fulfillment` | `PATCH`, `POST` | `getAdminSession` | `PATCH/POST { fulfillmentStatus }` advances a `paid` order sequentially (`unfulfilled` -> `preparing` -> `shipped` -> `delivered`). Rejects unpaid orders or skipped/backward transitions with `400`. |
| `/api/chat` | `POST` | Public | `POST { messages }` routes shopper conversation through `GuardedChatAssistant` (`200 { message }`, `400` malformed body, `503` unconfigured provider on open-ended turn, `502` upstream error). |
| `/api/try-on` | `POST` | Public | `multipart/form-data` (`photo`, `productSlug`, `size`, `color`, `consent="accepted"`). Pre-flight validates photo (`400 invalid_photo`), resolves published variant (`400 not_available`), invokes `TryOnProvider` with `30 s` timeout (`200 { image, garment }`, `504 provider_timeout`, `503 provider_unavailable`, `502 provider_error`). |

---

## 7. AI Subsystems: Deterministic Guardrails, Try-On Privacy & 3-Tier Provider Resolution

### 3-Tier AI Provider Resolution Chain (`lib/chat/index.ts` & `lib/try-on/index.ts`)

Both `getChatAssistant()` ([`lib/chat/index.ts`](lib/chat/index.ts)) and `getTryOnProvider()` ([`lib/try-on/index.ts`](lib/try-on/index.ts)) resolve their backing adapter lazily at request time using a 3-tier priority chain:

| Priority Tier | Condition | Chat Assistant Adapter & Default Model | Virtual Try-On Adapter & Default Model | Authentication Mechanism |
| --- | --- | --- | --- | --- |
| **Tier 1: Google Cloud Vertex AI** | `gcp-service-account.json` (or `GOOGLE_APPLICATION_CREDENTIALS`) exists on disk and `USE_VERTEX_AI !== "false"` | [`VertexChatAssistant`](lib/chat/vertex-chat-assistant.ts)<br>(`VERTEX_CHAT_MODEL` or `gemini-2.5-flash`) | [`VertexTryOnProvider`](lib/try-on/vertex-try-on-provider.ts)<br>(`VERTEX_IMAGE_MODEL` or `gemini-2.5-flash-image`) | Zero-SDK RS256 JWT assertion signed via `node:crypto` in [`lib/ai/google-auth.ts`](lib/ai/google-auth.ts) and exchanged at `https://oauth2.googleapis.com/token` (cached with 5-min expiry buffer). |
| **Tier 2: Google Gemini API** | `GEMINI_API_KEY` is set (or `TRYON_PROVIDER="gemini"`) | [`GeminiChatAssistant`](lib/chat/gemini-chat-assistant.ts)<br>(`GEMINI_CHAT_MODEL` or `gemini-3.8-flash`) | [`GeminiTryOnProvider`](lib/try-on/gemini-try-on-provider.ts)<br>(`GEMINI_IMAGE_MODEL` or `gemini-3.1-flash-image`) | `x-goog-api-key` header against `https://generativelanguage.googleapis.com/v1beta`. |
| **Tier 3: OpenAI / DevExpert Compatible Gateway** | `OPENAI_API_KEY` (Chat) or `TRYON_BASE_URL` + `TRYON_MODEL` + (`TRYON_API_KEY` \| `DEVEXPERT_API_KEY` \| `OPENAI_API_KEY`) (Try-On) | [`OpenAiChatAssistant`](lib/chat/openai-chat-assistant.ts)<br>(`CHAT_ASSISTANT_MODEL` or `gpt-4o-mini` at `POST {baseUrl}/chat/completions`) | [`OpenAiImagesTryOnProvider`](lib/try-on/openai-images-try-on-provider.ts)<br>(`TRYON_MODEL` e.g. `image-edit` at `POST {baseUrl}/images/edits`) | `Authorization: Bearer <apiKey>` over multipart/JSON HTTP with `30 s` `AbortSignal.timeout`. |

### Subsystem 1: Guarded Chat Assistant (`lib/chat/guarded-chat-assistant.ts`)

Recorded in [ADR 0003](docs/adr/0003-chat-assistant-llm-provider.md), [ADR 0004](docs/adr/0004-chat-assistant-guardrails.md), and [`CONSTRAINTS.md`](CONSTRAINTS.md) (#5, #6, #7), the Chat Assistant **never trusts an LLM to invent store policies, prices, stock availability, or body measurements**:

1. **Out-of-Scope & Prompt-Injection Refusal ([`lib/chat/guardrails/intents.ts`](lib/chat/guardrails/intents.ts)):** Prompts asking to ignore instructions, reveal system prompts, write code, or discuss non-store topics are intercepted before any DB or LLM call and answered with the fixed `OUT_OF_SCOPE_REPLY`.
2. **Verified Store Policy Lookup ([`lib/chat/guardrails/store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts)):** Questions regarding shipping cost (`Standard free 3–5 business days, Express $15.00 flat 1–2 business days`), shipping regions (`US 50 states + DC`), tax/currency (`USD tax-exclusive, state sales tax at checkout`), checkout account creation, or unpublished policies (`return_window`, `exchange_policy`, `order_cancellation`, `payment_methods`, `discounts_and_promo_codes`, `physical_stores`) return the exact code-reviewed policy copy without invoking the LLM.
3. **Deterministic Catalog, Variant & Size-Chart Grounding ([`product-match.ts`](lib/chat/guardrails/product-match.ts) & [`answer.ts`](lib/chat/guardrails/answer.ts)):**
   - Queries `listPublishedProductFacts(db)` ([`db/catalog.ts`](db/catalog.ts)), which strictly filters for `status = 'published'` and non-discontinued variants (`draft` and `archived` products are invisible).
   - Matches specific garments by name/slug or generic category nouns (`coat`, `blazer`, `trousers`, `dress`, `shirt`, `knitwear`) via `CATEGORY_SYNONYMS`.
   - Price, sizing/fit (`size_chart` body measurements in inches for offered sizes), material/care, and variant stock questions are answered deterministically from database rows formatted with `formatPriceUSD`. Because these turns never call the LLM, they succeed even when no AI API key is configured.
4. **Post-LLM Dollar-Amount Verification ([`lib/chat/guardrails/answer-guard.ts`](lib/chat/guardrails/answer-guard.ts)):** Only open-ended in-scope styling conversation reaches the underlying `ChatAssistant` adapter, with verified catalog facts and policies injected as system context. Before returning the LLM's reply, `guardLlmAnswer()` extracts every `$` amount in the response, normalizes it to canonical `$X.XX`, and checks **exact set membership** against the verified published prices and policy dollar amounts (`$0.00`, `$15.00`). Any reply containing an unverified dollar figure is discarded and replaced with `UNVERIFIED_PRICE_FALLBACK`.

#### Diagram 2: Chat Assistant Deterministic Guardrail & LLM Fallback Pipeline

```mermaid
flowchart TD
  Req["POST /api/chat ({ messages })"] --> Validate["Validate Non-Empty Messages Array & User Prompt"]
  Validate -- "Invalid Payload" --> Err400["HTTP 400 { error } (Cache-Control: no-store)"]
  Validate -- "Valid User Message" --> Classify["Classify Intent (lib/chat/guardrails/intents.ts)"]

  Classify -- "Out-of-Scope or Prompt Injection" --> Refusal["Return Fixed OUT_OF_SCOPE_REPLY (LLM Never Called)"]
  Classify -- "Store Policy Topic (shipping, returns, tax, etc.)" --> Policy["Lookup STORE_POLICIES (store-knowledge.ts)"]
  Policy --> PolicyReply["Return Exact Verified / Not-Published Policy Copy (LLM Never Called)"]

  Classify -- "Price / Sizing / Product Info / Open-Ended" --> ReadDB["Load Published Catalog Facts (listPublishedProductFacts in db/catalog.ts)"]
  ReadDB --> Match["Match Product by Name, Slug, or Category Synonym (product-match.ts)"]

  Match -- "Price Intent (Matched Published Product)" --> PriceReply["Format Exact USD Price via formatPriceUSD (LLM Never Called)"]
  Match -- "Price Intent (Unmatched / Draft / Archived)" --> UnpubPrice["Return UNKNOWN_PRODUCT_PRICE_REPLY (LLM Never Called)"]

  Match -- "Sizing & Fit Intent" --> SizeCheck{"Matched Product Has size_chart Rows?"}
  SizeCheck -- "Yes" --> SizeReply["Format Available Variants + Body Measurements in Inches (LLM Never Called)"]
  SizeCheck -- "No Chart / No Match" --> NoChartReply["Return NO_SIZE_CHART_REPLY or SIZE_GUIDE_PROMPT_REPLY (LLM Never Called)"]

  Match -- "Product Material / Care / Stock Intent" --> InfoReply["Format Composition, Care, Price & Variant Stock (LLM Never Called)"]

  Match -- "Open-Ended In-Scope Styling Turn" --> ResolveLLM["Resolve 3-Tier Adapter (Vertex AI -> Gemini API -> OpenAI)"]
  ResolveLLM --> CallLLM["Call inner.answer() with Injected Verified Facts & Instructions"]
  CallLLM --> GuardAnswer["guardLlmAnswer() (answer-guard.ts): Extract All Dollar Amounts"]
  GuardAnswer -- "All $ Amounts in Allowed Canonical Set" --> SafeReply["Return Grounded LLM Reply (HTTP 200)"]
  GuardAnswer -- "Contains Unverified $ Amount" --> StripReply["Discard Reply -> Return UNVERIFIED_PRICE_FALLBACK (HTTP 200)"]
```

### Subsystem 2: Virtual Try-On & Zero-Persistence In-Memory Privacy (`lib/try-on/`)

Governed by [`CONSTRAINTS.md`](CONSTRAINTS.md) (#8, #9) and [`docs/user-and-access-model.md`](docs/user-and-access-model.md):

1. **Authoritative Pre-Flight Photo Validation ([`lib/try-on/photo-validation.ts`](lib/try-on/photo-validation.ts)):**
   - Executed in both the client picker (for immediate feedback) and `POST /api/try-on` (authoritative gate **before** `getTryOnGarmentContext` or `getTryOnProvider` is ever called).
   - Enforces: (a) non-empty file, (b) declared MIME allowlist (`image/jpeg`, `image/png`, `image/webp` — HEIC/AVIF/SVG/PDF rejected), (c) inclusive size cap of `4 MiB` (`4 * 1024 * 1024 = 4,194,304` bytes), and (d) magic-byte signature verification (`FF D8 FF` for JPEG, `89 50 4E 47 0D 0A 1A 0A` for PNG, `RIFF....WEBP` for WebP). Spoofed extensions or oversized files immediately return `400 { code: "invalid_photo" }`.
2. **Server-Resolved Published Garment Context:** Resolves the target garment from `db/catalog.ts` (`getTryOnGarmentContext`), requiring a `published` product and a non-discontinued `(size, color)` variant (out-of-stock variants remain eligible for visual try-on). Reads the local SVG/raster garment reference from `public/images/products/` when available so multi-modal models (`VertexTryOnProvider`, `GeminiTryOnProvider`) receive both the shopper photo and the actual garment reference image.
3. **Bounded Timeout & Graceful Failure Mapping:** Every provider call is bounded by a `30,000 ms` (`30 s`) `AbortSignal.timeout`. Timeouts map to `TryOnProviderError(kind: "timeout")` -> HTTP `504 { code: "provider_timeout" }`; missing configuration/DB failures map to `503 { code: "provider_unavailable" }`; upstream failures map to `502 { code: "provider_error" }`. On retryable errors (`502`/`503`/`504`), the client panel retains the selected in-memory `File`, size, color, and consent checkbox so clicking **"Try again"** re-submits without re-picking the file.
4. **Strict Zero-Persistence Privacy Guarantee:**
   - **No Database Table or Column:** [`db/schema/index.ts`](db/schema/index.ts) explicitly omits any try-on table.
   - **No Disk, Temp File, Object Storage, or Browser Storage:** Photo bytes live only in an in-memory `Uint8Array` for the duration of the HTTP request and in React component state (`useState`) on the client. Neither `localStorage`, `sessionStorage`, `indexedDB`, nor filesystem writes are ever used.
   - **No Caching or Sensitive Logging:** Every response carries `Cache-Control: no-store`. Server error logs record only fixed messages and error `kind`/`status` — never image bytes, base64 payloads, data URLs, or upstream provider response bodies.

#### Diagram 3: Virtual Try-On In-Memory Privacy & Multi-Provider Sequence

```mermaid
sequenceDiagram
  autonumber
  actor Shopper
  participant Panel as "TryOnPanel (Client React State Only)"
  participant API as "POST /api/try-on (Route Handler)"
  participant Validator as "photo-validation.ts (4 MiB + Magic Bytes)"
  participant CatalogDB as "db/catalog.ts (getTryOnGarmentContext)"
  participant Factory as "lib/try-on/index.ts (getTryOnProvider)"
  participant Provider as "TryOnProvider (Vertex AI / Gemini / OpenAI Images)"

  Shopper->>Panel: Select Size/Color, Pick Photo (JPEG/PNG/WebP <= 4 MiB) & Check Consent
  Panel->>Validator: validateTryOnPhotoSelection(file) (Client Pre-Flight)
  alt Invalid Client File (Wrong MIME or > 4 MiB)
    Validator-->>Panel: { valid: false, message }
    Panel-->>Shopper: Clear File Input & Render role="alert" Error (No HTTP Request Sent)
  else Valid Client Selection
    Shopper->>Panel: Click "Try on"
    Panel->>API: POST multipart/form-data (photo, productSlug, size, color, consent="accepted")
    API->>Validator: validateTryOnPhotoSelection + sniffTryOnPhotoMimeType(bytes)
    alt Empty, > 4 MiB, Unsupported MIME, or Spoofed Magic Bytes
      Validator-->>API: Rejection (invalid_photo)
      API-->>Panel: HTTP 400 { code: "invalid_photo" } (Cache-Control: no-store)
      Panel-->>Shopper: Clear Selection & Show Fixed Validation Message
    else Valid Photo Bytes in Memory
      API->>CatalogDB: getTryOnGarmentContext(db, productSlug, size, color)
      alt Draft, Archived, Discontinued, or Unknown Variant
        CatalogDB-->>API: null
        API-->>Panel: HTTP 400 { code: "not_available" } (Cache-Control: no-store)
      else Published Product & Active Variant Resolved
        API->>Factory: getTryOnProvider() (Tier 1 Vertex -> Tier 2 Gemini -> Tier 3 OpenAI/DevExpert)
        API->>Provider: generateTryOn({ photo, garment, prompt }) [AbortSignal.timeout(30_000)]
        alt Provider Timeout (> 30 s)
          Provider-->>API: TryOnProviderError (kind: "timeout")
          API-->>Panel: HTTP 504 { code: "provider_timeout" } (Cache-Control: no-store)
          Panel-->>Shopper: Retain In-Memory Photo/Consent & Enable "Try again" Button
        else Upstream Provider Failure
          Provider-->>API: TryOnProviderError (kind: "upstream")
          API-->>Panel: HTTP 502 { code: "provider_error" } (Cache-Control: no-store)
          Panel-->>Shopper: Retain In-Memory Photo/Consent & Enable "Try again" Button
        else Generation Succeeded
          Provider-->>API: TryOnResult { image: { kind: "base64", mimeType, data } }
          API-->>Panel: HTTP 200 { image, garment } (Cache-Control: no-store, Zero Persistence)
          Panel-->>Shopper: Render Generated Try-On Preview in Memory
        end
      end
    end
  end
```

---

## 8. Guest-First Checkout, Atomic Stock Reservation & Identity Lifecycle

Implemented across [`db/checkout.ts`](db/checkout.ts), [`db/order.ts`](db/order.ts), [`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts), [`payments/simulated-provider.ts`](payments/simulated-provider.ts), and [`app/api/checkout/pay/route.ts`](app/api/checkout/pay/route.ts), checkout follows a strict 3-step guest-first pipeline:

1. **Step 1 — Contact & US Shipping Address (`POST /api/checkout/contact-and-address`):** Validates email, recipient name, street address, 2-letter US state (`AL`..`WY` + `DC`), and 5/9-digit ZIP code. If the shopper enters an optional **Quick Access password** (`>= 8` chars with at least one letter and one digit), it is hashed immediately with `scrypt` (`hashPassword`) and stored on `checkout_session.password_hash`.
2. **Step 2 — Shipping Method (`POST /api/checkout/shipping-method`):** Links the selected `shipping_method` (`standard` at `0` cents or `express` at `1500` cents) to `checkout_session`.
3. **Step 3 — Destination Sales Tax & Atomic Payment Execution (`POST /api/checkout/pay`):**
   - **Pre-Payment Stock Check:** `createPaidOrderFromCheckout` verifies the cart is non-empty and all lines have sufficient `stockQty` before calling `PaymentProvider.createPayment`.
   - **Simulated Payment Execution:** Calls `PaymentProvider.createPayment`. If the payment returns `payment.failed` (e.g. `card_declined`), **no paid order is created**, variant stock and `cart` remain untouched, and the shopper can retry in place (`HTTP 402`).
   - **Deadlock-Free Atomic Stock Reservation:** Inside a single PostgreSQL transaction (`db.transaction`), cart lines are sorted deterministically by `variantId` (`localeCompare`) and each variant is decremented via an atomic conditional update:
     ```sql
     UPDATE variant
     SET stock_qty = stock_qty - $qty
     WHERE id = $variantId
       AND discontinued = false
       AND stock_qty >= $qty
     RETURNING id, stock_qty;
     ```
     If a concurrent checkout claimed the last unit milliseconds earlier, the `UPDATE` returns `0` rows, the transaction throws `InsufficientStockError` and rolls back completely, and the route returns `409 { code: "out_of_stock" }`.
   - **Account Creation or Linking at Payment Time:** Inside the same transaction, the normalized lowercase email is looked up in `account`. If no account exists, a new `account` row is inserted (with `checkout_session.password_hash` if provided). If an account already exists, the order links to it (and fills `password_hash` only if the existing account had no password yet, never overwriting an existing password). An `account_role` row (`role = 'customer'`) is upserted with `ON CONFLICT DO NOTHING`.
   - **Frozen Order Snapshot & Non-Blocking Email:** Inserts `address`, `order` (`status = 'paid'`, `fulfillment_status = 'unfulfilled'`, frozen `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`), frozen `order_line` snapshots (`product_name`, `variant_size`, `variant_color`, `unit_price_cents`), and `payment` (`status = 'succeeded'`), then marks `cart.status = 'converted'`. Finally, `OrderConfirmationEmailSender.send()` runs in a non-blocking `try/catch` so email delivery glitches never roll back a completed purchase.

### Diagram 4: Guest-First Checkout, Atomic Stock Reservation & Account Linking Sequence

```mermaid
sequenceDiagram
  autonumber
  actor Shopper
  participant CheckoutUI as "/checkout (3-Step Client Form)"
  participant PayAPI as "POST /api/checkout/pay"
  participant OrderRepo as "db/order.ts (createPaidOrderFromCheckout)"
  participant PayPort as "PaymentProvider (SimulatedPaymentProvider)"
  participant PG as "PostgreSQL 17 (Transaction)"
  participant EmailPort as "OrderConfirmationEmailSender"

  Shopper->>CheckoutUI: Complete Step 1 (Email, US Address, Optional Password) & Step 2 (Shipping)
  Shopper->>CheckoutUI: Submit Payment in Step 3 (Card Token / Scenario)
  CheckoutUI->>PayAPI: POST /api/checkout/pay ({ cardToken, paymentScenario })
  PayAPI->>OrderRepo: createPaidOrderFromCheckout(db, sessionToken, paymentProvider, ...)
  OrderRepo->>PG: Load Active Cart Lines + CheckoutSession + ShippingMethod + TaxCents
  OrderRepo->>PayPort: createPayment({ reference: "JA-XXXXXX", amountCents: totalCents, currency: "USD", cardToken })

  alt Payment Declined (payment.failed)
    PayPort-->>OrderRepo: { type: "payment.failed", reason: "card_declined" }
    OrderRepo-->>PayAPI: { ok: false, code: "payment_failed" } (No DB Writes, Cart & Stock Preserved)
    PayAPI-->>CheckoutUI: HTTP 402 { error, outcome }
    CheckoutUI-->>Shopper: Display Retryable Payment Failure Notice
  else Payment Succeeded (payment.succeeded)
    PayPort-->>OrderRepo: { type: "payment.succeeded", providerRef: "sim_JA-XXXXXX" }
    OrderRepo->>PG: BEGIN TRANSACTION (Sort Cart Lines by variantId ASC)
    loop For Each Sorted Cart Line
      OrderRepo->>PG: UPDATE variant SET stock_qty = stock_qty - qty WHERE id = ? AND discontinued = false AND stock_qty >= qty
    end
    alt Any Variant Has Insufficient Stock (Concurrent Last-Unit Race)
      PG-->>OrderRepo: 0 Rows Updated -> Throw InsufficientStockError & ROLLBACK
      OrderRepo-->>PayAPI: { ok: false, code: "out_of_stock", details }
      PayAPI-->>CheckoutUI: HTTP 409 { code: "out_of_stock" }
      CheckoutUI-->>Shopper: Show Stock Exhausted Alert & Preserve Cart for Adjustment
    else All Variants Reserved Atomically
      OrderRepo->>PG: Find or Create account (Lowercase Email + Optional scrypt password_hash)
      OrderRepo->>PG: INSERT account_role (role = "customer") ON CONFLICT DO NOTHING
      OrderRepo->>PG: INSERT address + order (status="paid", fulfillment="unfulfilled", frozen totals)
      OrderRepo->>PG: INSERT Frozen order_line Snapshots + payment (status="succeeded")
      OrderRepo->>PG: UPDATE cart SET status = "converted", account_id = account.id + DELETE checkout_session
      OrderRepo->>PG: COMMIT TRANSACTION
      OrderRepo->>EmailPort: send(OrderConfirmationEmailPayload) [Non-Blocking try/catch]
      OrderRepo-->>PayAPI: { ok: true, order }
      PayAPI-->>CheckoutUI: HTTP 200 { ok: true, orderReference: "JA-XXXXXX" }
      CheckoutUI-->>Shopper: Redirect to /checkout/confirmation/JA-XXXXXX
    end
  end
```

---

## 9. PostgreSQL 17 Data Layer: 17 Tables, 7 Enums, Migrations & Seeds

### 7 PostgreSQL Enums (`db/schema/enums.ts`)

| Enum Name (`pgEnum`) | Allowed Values | Domain Usage |
| --- | --- | --- |
| `product_status` | `'draft'`, `'published'`, `'archived'` | Controls storefront visibility on `/catalog`, `/products/[slug]`, Chat Assistant, and Try-On |
| `variant_size` | `'XS'`, `'S'`, `'M'`, `'L'`, `'XL'` | Standard US garment sizing dimension across `variant` and `size_chart` |
| `cart_status` | `'active'`, `'converted'`, `'expired'` | Guest session cart lifecycle (`active` until converted into a `paid` order) |
| `account_role_name` | `'customer'`, `'admin'` | Multi-role attribute rows in `account_role` |
| `order_status` | `'created'`, `'paid'`, `'failed'`, `'cancelled'` | Financial lifecycle of an order (`paid` upon succeeded payment + stock reservation) |
| `fulfillment_status` | `'unfulfilled'`, `'preparing'`, `'shipped'`, `'delivered'` | Sequential logistics lifecycle for `paid` orders (managed in `/admin/orders/[reference]`) |
| `payment_status` | `'pending'`, `'succeeded'`, `'failed'`, `'cancelled'` | Payment attempt state recorded in `payment` |

### Complete 17-Table Inventory (`db/schema/*.ts`)

| # | Table Name | Schema File | Primary Key & Natural Keys / Constraints | Core Columns & Purpose |
| --- | --- | --- | --- | --- |
| 1 | `category` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), ` UNIQUE(slug)` | `slug`, `name`, `sort_order`. Product taxonomy (`coats`, `blazers`, `trousers`, `dresses`, `shirts`, `knitwear`). |
| 2 | `product` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(slug)`, `INDEX(status)` | `slug`, `name`, `description`, `composition`, `care`, `base_price_cents` (`bigint`), `currency` (`'USD'`), `category_id` (FK), `status` (`product_status`). |
| 3 | `product_image` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(product_id, position)` | `product_id` (FK), `path`, `alt_text`, `position` (0-indexed display order). |
| 4 | `variant` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(product_id, size, color)`, `UNIQUE(sku)`, `CHECK(stock_qty >= 0)` | `product_id` (FK), `size` (`variant_size`), `color`, `color_hex`, `sku`, `price_override_cents` (`bigint` nullable), `stock_qty`, `discontinued`. |
| 5 | `size_chart` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(category_id, size)` | `category_id` (FK), `size` (`variant_size`), `measurements` (`jsonb` body ranges in inches: `chest`, `waist`, `hip`, `sleeve`, `length`, `inseam`, `rise`). |
| 6 | `account` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(email)`, `CHECK(email = lower(email))` | `email` (lowercase), `password_hash` (`scrypt` `<saltHex>:<keyHex>` nullable), `created_at`, `updated_at`. |
| 7 | `account_role` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(account_id, role)` | `account_id` (FK), `role` (`account_role_name`: `'customer'` \| `'admin'`). |
| 8 | `address` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`) | `account_id` (FK nullable), `recipient_name`, `line1`, `line2`, `city`, `state` (`char(2)`), `zip`, `country` (`'US'`), `phone`. |
| 9 | `account_session` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(session_token)` | `account_id` (FK `ON DELETE CASCADE`), `session_token` (`ja_account_session` cookie token), `expires_at` (30 days), `created_at`. |
| 10 | `account_access_code` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`) | `account_id` (FK `ON DELETE CASCADE`), `code` (6-digit numeric OTP), `expires_at` (15 minutes), `created_at`. Deleted on use. |
| 11 | `cart` | [`db/schema/cart.ts`](db/schema/cart.ts) | `id` (`uuid`), `UNIQUE(session_token)` | `session_token` (`ja_cart_session` cookie token), `account_id` (FK nullable), `status` (`cart_status`), `created_at`, `updated_at`. |
| 12 | `cart_line` | [`db/schema/cart.ts`](db/schema/cart.ts) | `id` (`uuid`), `UNIQUE(cart_id, variant_id)`, `CHECK(quantity > 0)` | `cart_id` (FK), `variant_id` (FK), `quantity` (`integer` 1..10). |
| 13 | `checkout_session` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(cart_id)` | `cart_id` (FK `ON DELETE CASCADE`), `email`, `recipient_name`, `line1`, `line2`, `city`, `state`, `zip`, `country`, `phone`, `password_hash`, `shipping_method_id` (FK). |
| 14 | `shipping_method` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(slug)` | `slug` (`standard` / `express`), `name`, `description`, `cost_cents` (`bigint`: `0` / `1500`), `delivery_estimate`. |
| 15 | `order` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(reference)` | `reference` (`JA-XXXXXX`), `account_id` (FK nullable), `contact_email`, `status` (`order_status`), `fulfillment_status`, `address_id` (FK), `shipping_method_id` (FK), frozen `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `currency` (`'USD'`), `created_at`, `paid_at`. |
| 16 | `order_line` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`) | `order_id` (FK), `variant_id` (FK nullable), frozen `product_name`, `variant_size`, `variant_color`, `unit_price_cents` (`bigint`), `quantity`, `line_total_cents` (`bigint`). |
| 17 | `payment` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`) | `order_id` (FK), `status` (`payment_status`), `provider` (`'simulated'`), `amount_cents` (`bigint`), `created_at`, `updated_at`. |

### Committed Drizzle Migration History (`db/migrations/`)

| Migration Tag | SQL File | Schema Changes Introduced |
| --- | --- | --- |
| `0000_bumpy_lifeguard` | [`db/migrations/0000_bumpy_lifeguard.sql`](db/migrations/0000_bumpy_lifeguard.sql) | Creates initial 7 `pgEnum` types and 13 core tables (`category`, `product`, `product_image`, `variant`, `account`, `account_role`, `address`, `cart`, `cart_line`, `shipping_method`, `order`, `order_line`, `payment`). |
| `0001_needy_malice` | [`db/migrations/0001_needy_malice.sql`](db/migrations/0001_needy_malice.sql) | Creates `size_chart` table (`category_id`, `size`, `measurements` JSONB, `UNIQUE(category_id, size)`). |
| `0002_daily_gabe_jones` | [`db/migrations/0002_daily_gabe_jones.sql`](db/migrations/0002_daily_gabe_jones.sql) | Creates `checkout_session` table (`UNIQUE(cart_id)`) and adds `recipient_name` column to `address`. |
| `0003_freezing_vargas` | [`db/migrations/0003_freezing_vargas.sql`](db/migrations/0003_freezing_vargas.sql) | Adds `shipping_method_id` foreign key column to `checkout_session`. |
| `0004_mean_texas_twister` | [`db/migrations/0004_mean_texas_twister.sql`](db/migrations/0004_mean_texas_twister.sql) | Adds `'unfulfilled'` value to `fulfillment_status` enum (before `'preparing'`) and makes `order.account_id` nullable. |
| `0005_dark_warbird` | [`db/migrations/0005_dark_warbird.sql`](db/migrations/0005_dark_warbird.sql) | Adds `password_hash` column to `checkout_session` for optional Quick Access password creation during checkout. |
| `0006_fresh_zombie` | [`db/migrations/0006_fresh_zombie.sql`](db/migrations/0006_fresh_zombie.sql) | Creates `account_session` and `account_access_code` tables for customer/admin session cookies and 6-digit email OTP authentication. |

### Diagram 5: PostgreSQL 17-Table Entity-Relationship Diagram (`erDiagram`)

```mermaid
erDiagram
  category ||--o{ product : "categorizes"
  category ||--o{ size_chart : "defines_measurements"
  product ||--o{ product_image : "displays"
  product ||--o{ variant : "has_matrix"

  account ||--o{ account_role : "grants"
  account ||--o{ account_session : "authenticates"
  account ||--o{ account_access_code : "verifies_otp"
  account ||--o{ address : "stores"
  account ||--o{ cart : "links_on_pay"
  account ||--o{ order : "places"

  cart ||--o{ cart_line : "contains"
  variant ||--o{ cart_line : "selected_in"
  cart ||--o| checkout_session : "stages"
  shipping_method ||--o{ checkout_session : "chosen_in"

  address ||--o{ order : "ships_to"
  shipping_method ||--o{ order : "delivers_via"
  order ||--o{ order_line : "freezes"
  variant ||--o{ order_line : "snapshot_of"
  order ||--o{ payment : "settled_by"

  category {
    uuid id PK
    text slug UK
    text name
    integer sort_order
  }
  product {
    uuid id PK
    text slug UK
    text name
    bigint base_price_cents
    char currency
    uuid category_id FK
    product_status status
  }
  product_image {
    uuid id PK
    uuid product_id FK
    text path
    text alt_text
    integer position
  }
  variant {
    uuid id PK
    uuid product_id FK
    variant_size size
    text color
    text color_hex
    text sku UK
    bigint price_override_cents
    integer stock_qty
    boolean discontinued
  }
  size_chart {
    uuid id PK
    uuid category_id FK
    variant_size size
    jsonb measurements
  }
  account {
    uuid id PK
    text email UK
    text password_hash
    timestamptz created_at
  }
  account_role {
    uuid id PK
    uuid account_id FK
    account_role_name role
  }
  account_session {
    uuid id PK
    uuid account_id FK
    text session_token UK
    timestamptz expires_at
  }
  account_access_code {
    uuid id PK
    uuid account_id FK
    text code
    timestamptz expires_at
  }
  address {
    uuid id PK
    uuid account_id FK
    text recipient_name
    text line1
    char state
    text zip
    char country
  }
  cart {
    uuid id PK
    text session_token UK
    uuid account_id FK
    cart_status status
  }
  cart_line {
    uuid id PK
    uuid cart_id FK
    uuid variant_id FK
    integer quantity
  }
  checkout_session {
    uuid id PK
    uuid cart_id FK
    text email
    text recipient_name
    char state
    text zip
    text password_hash
    uuid shipping_method_id FK
  }
  shipping_method {
    uuid id PK
    text slug UK
    text name
    bigint cost_cents
    text delivery_estimate
  }
  order {
    uuid id PK
    text reference UK
    uuid account_id FK
    text contact_email
    order_status status
    fulfillment_status fulfillment_status
    uuid address_id FK
    uuid shipping_method_id FK
    bigint subtotal_cents
    bigint shipping_cents
    bigint tax_cents
    bigint total_cents
  }
  order_line {
    uuid id PK
    uuid order_id FK
    uuid variant_id FK
    text product_name
    text variant_size
    text variant_color
    bigint unit_price_cents
    integer quantity
    bigint line_total_cents
  }
  payment {
    uuid id PK
    uuid order_id FK
    payment_status status
    text provider
    bigint amount_cents
  }
```

### Diagram 6: Product, Cart, Order, Payment & Fulfillment Lifecycle State Machines (`stateDiagram-v2`)

```mermaid
stateDiagram-v2
  direction LR

  state "Product Lifecycle (product_status)" as ProductSM {
    [*] --> draft : "Admin creates product"
    draft --> published : "Publish Product"
    draft --> archived : "Archive Product"
    published --> archived : "Archive Product"
    published --> draft : "Revert to Draft"
    archived --> published : "Publish Product"
    archived --> draft : "Revert to Draft"
  }

  state "Cart Lifecycle (cart_status)" as CartSM {
    [*] --> active : "First POST /api/cart/lines"
    active --> converted : "Payment Succeeded (Order Created)"
    active --> expired : "Session Expired"
  }

  state "Order & Fulfillment Lifecycle" as OrderSM {
    [*] --> created : "Order Initialized"
    created --> paid : "payment.succeeded + Stock Reserved"
    created --> failed : "payment.failed"
    created --> cancelled : "Order Cancelled"

    state paid {
      [*] --> unfulfilled : "Initial Paid State"
      unfulfilled --> preparing : "Admin: Mark as Preparing"
      preparing --> shipped : "Admin: Mark as Shipped"
      shipped --> delivered : "Admin: Mark as Delivered"
    }
  }
```

### Idempotent Demo Seed Inventory (`pnpm db:seed`)

Defined in [`db/seed-data.ts`](db/seed-data.ts) and executed by [`db/seed.ts`](db/seed.ts) using strict `ON CONFLICT DO NOTHING` semantics inside a single transaction:
- **6 Categories:** `Coats` (`coats`), `Blazers` (`blazers`), `Dresses` (`dresses`), `Knitwear` (`knitwear`), `Shirts` (`shirts`), `Trousers` (`trousers`).
- **9 Products (`6` `published`, `2` `draft`, `1` `archived`):**
  - *Published (6):* `Longline Wool Overcoat` (`$349.00`), `Double-Breasted Linen Blazer` (`$249.00`), `Silk Slip Midi Dress` (`$189.00`), `Merino Crewneck Sweater` (`$129.00`), `Cotton Poplin Shirt` (`$89.00`), `Pleated Wool Trousers` (`$159.00`).
  - *Draft (2):* `Cropped Tweed Jacket` (`$219.00`), `Ribbed Knit Cardigan` (`$145.00`).
  - *Archived (1):* `Satin Evening Gown` (`$299.00`).
- **40 Variants:** Covers sizes `XS`–`XL`, multiple colors with hex swatches, SKU codes, price overrides (`price_override_cents` on select variants), out-of-stock variants (`stock_qty = 0`), and discontinued variants (`discontinued = true`) to exercise every storefront filter and edge case.
- **16 Product Images:** 3:4 editorial SVG illustrations under `public/images/products/`.
- **30 Size Chart Rows:** `6 categories × 5 sizes (XS–XL)` with US body measurement ranges in inches.
- **2 Shipping Methods:** `Standard Shipping` (`$0.00`, `3–5 business days`) and `Express Shipping` (`$15.00`, `1–2 business days`).
- **Default Admin Backoffice Account:**
  - **Email:** `admin@j-armando.store`
  - **Password:** `Admin123!`
  - **Roles:** `admin`, `customer`

---

## 10. Durable Engineering Constraints & Architecture Decision Records (ADRs)

### The 10 Durable Rules (`CONSTRAINTS.md`)

Every feature in this repository enforces the 10 rules codified in [`CONSTRAINTS.md`](CONSTRAINTS.md):

1. **Money as Integer Cents (`#1`):** Money MUST be stored and computed as integer cents (`bigint`) in `currency char(3) = 'USD'`; catalog prices are tax-exclusive and US sales tax is added at checkout.
2. **Immutable Applied Migrations (`#2`):** Schema changes MUST go through new generated migrations (`pnpm db:generate`); applied SQL files in `db/migrations/` MUST NOT be edited by hand.
3. **Insert-If-Missing Seeds (`#3`):** Seed scripts MUST stay insert-if-missing (`ON CONFLICT DO NOTHING` on natural keys in one transaction) and MUST NOT update or delete existing rows.
4. **Self-Contained Test Suite (`#4`):** The automated test suite MUST NOT require Docker, a system PostgreSQL installation, or any pre-configured database (`db/tests/global-setup.ts` boots an ephemeral embedded PostgreSQL 17 server per run).
5. **Offline, Key-Free AI Tests (`#5`):** The automated test suite MUST NOT make live calls to external AI providers or require API keys; adapters accept an injectable `fetch` transport seam.
6. **Hexagonal Port Isolation (`#6`):** External AI and payment capabilities MUST sit behind repo-owned ports (`ChatAssistant`, `TryOnProvider`, `PaymentProvider`, `EmailSender`); UI and routes depend only on the port.
7. **Verified-Only Chat Facts (`#7`):** Shopper-facing store policies, prices, product attributes, and `size_chart` measurements MUST come deterministically from [`store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts) and published database rows — never from LLM output — and any LLM reply containing an unverified dollar amount MUST be discarded (`guardLlmAnswer`).
8. **Zero-Persistence Try-On Privacy (`#8`):** Try-on photos and results MUST NOT be persisted, cached, or logged (no DB table/column, no disk/temp files, no object storage, no `localStorage`/`IndexedDB`, `Cache-Control: no-store`).
9. **Pre-Flight Photo Validation & Bounded Provider Calls (`#9`):** Try-on MUST validate photos (`JPEG`/`PNG`/`WebP`, `<= 4 MiB` inclusive, magic-byte signature) before any catalog or provider call, and bound every provider request with a `30 s` timeout (`AbortSignal.timeout`).
10. **Server-Side Guest Cart Identity (`#10`):** Guest cart identity MUST be resolved exclusively from the opaque `httpOnly` `ja_cart_session` cookie; cart/line/session IDs are never accepted from request bodies or query strings to select a cart, and read operations never create a cart or mint a cookie.

### Architecture Decision Records (`docs/adr/`)

| ADR | Title | Decision Summary |
| --- | --- | --- |
| [`ADR 0001`](docs/adr/0001-standalone-git-repository.md) | Standalone Git Repository at the Project Root | Isolates the project root as its own standalone git repository for clean diff-based validator audits and worktree isolation. |
| [`ADR 0002`](docs/adr/0002-drizzle-data-access-layer.md) | Drizzle ORM + `drizzle-kit` over `pg` | Selects Drizzle ORM (`0.45.4`) + `drizzle-kit` (`0.31.11`) over `pg` with Node 24 native type-stripping and `embedded-postgres` (`17.10.0-beta.17`) for zero-Docker testing. |
| [`ADR 0003`](docs/adr/0003-chat-assistant-llm-provider.md) | Chat Assistant LLM Provider behind the `ChatAssistant` Port | Defines the `ChatAssistant` hexagonal port with injectable `fetch` adapters and lazy environment resolution across Vertex AI, Gemini API, and OpenAI. |
| [`ADR 0004`](docs/adr/0004-chat-assistant-guardrails.md) | Deterministic Guardrail Decorator for the Chat Assistant | Wraps `ChatAssistant` in `GuardedChatAssistant` so store policies, published prices, variants, and size charts are answered deterministically and unverified dollar figures are stripped. |

---

## 11. Local Quickstart, Verification Gate (`./init.sh`) & Multi-Agent SDD Workflow

### Prerequisites

- **macOS / Linux**
- **Node.js `v24.21.0`** via `nvm` (pinned by [`.nvmrc`](.nvmrc); [`./init.sh`](init.sh) automatically loads `~/.nvm/nvm.sh`)
- **pnpm `12.11.2`** via Corepack (`corepack enable`)
- *No Docker or system PostgreSQL installation is required* (`pnpm db:devdb` boots an embedded PostgreSQL 17 instance on demand).

### Step-by-Step Local Setup

#### 1. Run the Standard Verification Gate

```bash
./init.sh
```

`./init.sh` installs frozen dependencies, runs ESLint, runs `tsc --noEmit`, and executes all 99 Vitest suites (`667` tests across `ui` + `db` over an ephemeral embedded PostgreSQL 17 cluster), then exits `0`.

#### 2. Configure Environment Variables (`.env.local`)

Copy [`.env.example`](.env.example) to `.env.local` (gitignored):

```bash
cp .env.example .env.local
```

| Variable | Required? | Default / Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | For `pnpm dev` & `db:*` | `postgresql://postgres:password@127.0.0.1:5432/j_armando` | PostgreSQL connection URL. Use `pnpm db:devdb` if you don't have a local Postgres server. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional (Tier 1 AI) | `./gcp-service-account.json` | Path to GCP service account JSON for Vertex AI (`gemini-2.5-flash` / `gemini-2.5-flash-image`). |
| `USE_VERTEX_AI` | Optional | `true` (`"false"` disables Tier 1) | Set to `"false"` to skip Vertex AI even if `gcp-service-account.json` is present. |
| `VERTEX_LOCATION` | Optional | `us-central1` | Google Cloud region for Vertex AI endpoints. |
| `VERTEX_CHAT_MODEL` | Optional | `gemini-2.5-flash` | Vertex AI model for the Chat Assistant. |
| `VERTEX_IMAGE_MODEL` | Optional | `gemini-2.5-flash-image` | Vertex AI model for Virtual Try-On image generation. |
| `GEMINI_API_KEY` | Optional (Tier 2 AI) | `AQ.Ab8...` | Google AI Studio API key for direct Gemini API access. |
| `GEMINI_CHAT_MODEL` | Optional | `gemini-3.8-flash` | Gemini model used when `GEMINI_API_KEY` is active. |
| `GEMINI_IMAGE_MODEL` | Optional | `gemini-3.1-flash-image` | Gemini image model used when `GEMINI_API_KEY` is active. |
| `OPENAI_API_KEY` | Optional (Tier 3 AI) | `sk-...` | OpenAI or compatible gateway key for Chat Assistant fallback. |
| `CHAT_ASSISTANT_MODEL` | Optional | `gpt-4o-mini` | Model sent to the OpenAI-compatible Chat Completions endpoint. |
| `OPENAI_BASE_URL` | Optional | `https://api.openai.com/v1` | Base URL for OpenAI-compatible Chat Completions API. |
| `TRYON_BASE_URL` | Optional (Tier 3 AI) | `https://inference.devexpert.io/v1` | OpenAI-compatible Images API base **including `/v1`** (adapter appends `/images/edits`). |
| `TRYON_MODEL` | Optional (Tier 3 AI) | `image-edit` | Image-edit model name for Tier 3 Virtual Try-On. |
| `TRYON_API_KEY` | Optional (Tier 3 AI) | Falls back to `DEVEXPERT_API_KEY` -> `OPENAI_API_KEY` | Bearer token for Tier 3 Virtual Try-On endpoint. |

#### 3. Boot a Database, Migrate, Seed & Start the Storefront

**Option A — Using the Built-In Disposable PostgreSQL 17 (`pnpm db:devdb`, No Docker Needed):**

In Terminal 1, start the embedded database server and copy the printed `DATABASE_URL` into `.env.local`:

```bash
pnpm db:devdb
# Prints: DATABASE_URL=postgresql://postgres:password@127.0.0.1:<port>/j_armando
```

In Terminal 2, apply migrations, seed the demo catalog + default admin (`admin@j-armando.store` / `Admin123!`), verify population, and start the dev server:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm dev
```

**Option B — Using an Existing Local or Managed PostgreSQL Instance:**

Set `DATABASE_URL` in `.env.local`, then run `pnpm db:migrate && pnpm db:seed && pnpm db:verify && pnpm dev`.

### CLI Command Reference (`package.json`)

| Command | Description |
| --- | --- |
| `./init.sh` | Non-blocking startup & verification gate (`pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm typecheck` + `pnpm test`) |
| `pnpm dev` | Starts the Next.js 16.4 development server (`http://localhost:3000`) |
| `pnpm dev:phone` | Runs `next build && next start -p 3001` for zero-hydration-lag physical phone preview over LAN or tunnel |
| `pnpm build` | Produces an optimized Next.js 16.4 Turbopack production build |
| `pnpm start` | Starts the production Next.js server after `pnpm build` |
| `pnpm lint` | Runs ESLint 9 across the repository |
| `pnpm typecheck` | Runs `tsc --noEmit` strict TypeScript verification |
| `pnpm test` | Runs Vitest 5 (`ui` jsdom + `db` node integration suites over ephemeral `embedded-postgres`) |
| `pnpm db:generate` | Generates a new SQL migration in `db/migrations/` from `db/schema/` changes |
| `pnpm db:migrate` | Applies committed migrations in `db/migrations/` to `DATABASE_URL` |
| `pnpm db:seed` | Seeds the demo catalog, size charts, shipping methods, and default admin (`ON CONFLICT DO NOTHING`) |
| `pnpm db:verify` | Verifies minimum catalog counts (`6` categories, `9` products, `24+` variants, `30` size charts, `2` shipping methods) |
| `pnpm db:devdb` | Boots a disposable local PostgreSQL 17 server and prints its `DATABASE_URL` until stopped with `Ctrl-C` |

### Mobile Physical-Phone Preview & QR Code Rule (`AGENTS.md`)

As documented in [`AGENTS.md`](AGENTS.md) and [`PROGRESS.md`](PROGRESS.md) (`Session 013`):
- Next.js `next.config.ts` configures `allowedDevOrigins` for LAN and `*.trycloudflare.com` tunnels, and `pnpm dev:phone` (`next build && next start -p 3001`) eliminates dev-bundle hydration delay over tunnels.
- Whenever a runnable preview is deployed or redeployed (localhost, LAN, or tunnel), agents generate and display a scannable **QR code** alongside the mobile-reachable URL so the storefront can be validated directly on a physical phone.

### Spec-Driven Development (SDD) Multi-Agent Workflow (`.agents/skills/`)

This repository is engineered and validated using a modular multi-agent harness under `.agents/skills/`:

1. **`build-brief` (`.agents/skills/build-brief/SKILL.md`):** Conducts structured product discovery and generates the controlled discovery documents (`CONTEXT.md`, `DESIGN.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/mvp-scope.md`, `docs/risks-and-open-questions.md`).
2. **`harness-starter` (`.agents/skills/harness-starter/SKILL.md`):** Initializes the startup harness (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`) from the discovery corpus.
3. **`feature-spec` / Planner (`.agents/skills/feature-spec/SKILL.md`):** Selects the first dependency-ready feature in [`feature_list.json`](feature_list.json) and authors an implementation-ready specification under `docs/specs/<feature-id>.md`.
4. **`feature-implementer` / Generator (`.agents/skills/feature-implementer/SKILL.md`):** Implements strictly the selected feature spec (`WIP=1`), runs `./init.sh` and `pnpm build`, updates durable docs (`ARCHITECTURE.md`, `CONSTRAINTS.md`), and sets the feature status to `passing` (never `accepted`).
5. **`feature-validator` / Independent Evaluator (`.agents/skills/feature-validator/SKILL.md`):** Audits the implementation against the spec, acceptance scenarios, security rules, and scope boundaries in a fresh context, writing a validation report in `docs/validations/<feature-id>.md` and returning `accept`, `revise`, or `block`.
6. **`feature-flow` & `github-flow` (`.agents/skills/feature-flow/SKILL.md`, `.agents/skills/github-flow/SKILL.md`):** Orchestrates the end-to-end `planner -> implementer -> validator` loop across isolated git worktrees (`../tienda-worktrees/<id>`), dedicated ports/databases, and pull requests with full verification evidence.
