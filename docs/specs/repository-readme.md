# Feature Implementation Spec: Comprehensive repository README with architecture, stack, libraries, AI systems, database schema and Mermaid diagrams

## Source Feature

- `id`: `repository-readme`
- `area`: `documentation`
- `depends_on`: `["bootstrap-app-skeleton", "bootstrap-database-schema", "catalog-filtering", "product-variant-selection", "catalog-size-chart", "cart-stock-limits", "checkout-sales-tax", "payment-failure-path", "stock-reservation", "order-history", "order-confirmation-email", "admin-product-publish", "admin-order-fulfillment", "chat-assistant-guardrails", "virtual-tryon-failure"]` (all 15 direct dependencies — and all 31 preceding MVP features — are `accepted`)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Create a comprehensive, production-grade English `README.md` at the repository root that documents the **J. Armando** e-commerce platform end to end for developers, evaluators, and contributors. Now that all 31 functional MVP features are accepted, the repository lacks a root `README.md` unifying the domain model, editorial design system, technology stack, Hexagonal/Ports-and-Adapters architecture, deterministic AI guardrails, zero-persistence virtual try-on privacy model, 3-tier AI provider resolution, 17-table PostgreSQL schema across 7 Drizzle migrations, route/API surface, GitHub-renderable Mermaid diagrams, local quickstart, and Spec-Driven Development (SDD) multi-agent engineering workflow.

The deliverable is documentation-only (`README.md` at repo root, plus a minor sync to `ARCHITECTURE.md` if needed so all 31 shipped routes/tables match). It must not alter runtime application code, database schemas, or verification gate behavior.

## Non-Goals

- Modifying any application source code under `app/`, `lib/`, `payments/`, or `db/`.
- Creating new database migrations, altering `package.json` dependencies, or changing `.env.example`.
- Building out-of-scope features excluded by `docs/mvp-scope.md` (AI Stylist cross-sell, FITIQ fit prediction, newsletter, customer returns portal, carrier tracking portal, or live card payment gateways).
- Duplicating raw source code verbatim when concise architectural tables, Mermaid diagrams, and relative links to durable docs suffice.

## Job Story

When I open the repository root as a developer, architectural evaluator, or contributor,
I want a single authoritative, well-structured `README.md` with clear tables, architecture diagrams, and runnable setup instructions,
so I can understand the business domain, technical stack, AI safety/privacy boundaries, database schema, and verification workflow without hunting across dozens of files.

## Users And Permissions

- **Developer / Contributor / Evaluator (Repository Reader):** Full read access to `README.md` and linked documentation (`ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`, `docs/*`, `docs/adr/*`).
- **Storefront & Backoffice Roles Documented in README:**
  - **Guest:** Browses published catalog, filters/sorts, views product detail and category size guides, manages session cart (`ja_cart_session`), uses Chat Assistant and Virtual Try-On, and completes 3-step checkout.
  - **Customer:** Account created or linked at payment time (with optional Quick Access password); signs in via password or 6-digit single-use email OTP (`ja_account_session`) to view `/account`, `/account/orders`, and `/account/orders/[reference]`.
  - **Admin:** Authenticated account with `admin` role in `account_role` (guarded by `getAdminSession`); manages draft/published/archived products and variants (`/admin/products*`) and advances paid orders through sequential fulfillment (`/admin/orders*`).

## Acceptance Scenarios

### Scenario 1: Root README exists in English with valid GFM and working relative links
Given a clean checkout of the repository
When a reader opens `/README.md`
Then it is written entirely in English using valid GitHub Flavored Markdown
And every relative link to durable docs (`ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/mvp-scope.md`, `docs/risks-and-open-questions.md`, and `docs/adr/0001..0004`) resolves to an existing file or directory.

### Scenario 2: Domain model, design philosophy, and all 31 MVP capabilities are documented
Given `/README.md`
When a reader reviews the Product Overview & Design System sections
Then it documents the US market rules (USD integer-cent `bigint` storage, tax-exclusive catalog pricing, destination US state sales tax via `lib/tax/sales-tax.ts`), the three actors (`Guest`, `Customer`, `Admin`), the editorial zero-radius aesthetic (`Newsreader` serif + `Hanken Grotesk` sans, `#121212` charcoal ink on `#F9F8F5` warm ivory alabaster, `#4A5568` slate-steel AI surfaces), and all 31 accepted MVP features across Storefront, Cart, Checkout, Payments, Identity, Orders, Email, Backoffice, and AI.

### Scenario 3: Complete technology stack, toolchain, and library inventory with versions
Given `/README.md`
When a reader inspects the Technology Stack & Libraries section
Then every pinned tool and `package.json` dependency/devDependency is listed with its exact version and architectural role: Node.js `v24.21.0` (`.nvmrc`, native `--experimental-strip-types`), pnpm `12.11.2` (Corepack), Next.js `16.4.0` (App Router, Turbopack, RSC, async `params`/`searchParams`), React `19.3.0` & React DOM `19.3.0`, TypeScript `^5` (`5.9.3`), PostgreSQL 17 (`pg` `^8.23.1`), Drizzle ORM (`drizzle-orm` `^0.45.4`, `drizzle-kit` `0.31.11`), `embedded-postgres` (`17.10.0-beta.17`), Vitest `5.0.3` (`ui` jsdom + `db` node projects), Testing Library (`@testing-library/react` `^16.3.3`, `@testing-library/dom` `^10.4.2`, `jsdom` `^30.1.2`, `@vitejs/plugin-react` `^6.1.2`), ESLint `^9` (`eslint-config-next` `16.4.0`), and Node built-in `node:crypto` (`scrypt`, `timingSafeEqual`, `RSA-SHA256` JWT assertion).

### Scenario 4: Hexagonal Ports & Adapters architecture and complete route/API surface
Given `/README.md`
When a reader inspects the Architecture & Route Surface sections
Then it explains the dependency direction (`app/` UI & Route Handlers -> `lib/` & `payments/` Domain Ports & Decorators -> `db/` Drizzle Repositories -> PostgreSQL), documents all four ports (`ChatAssistant`, `TryOnProvider`, `PaymentProvider`, `EmailSender`/`AccessCodeEmailSender`) and their concrete adapters, and tabulates all storefront pages, customer account pages, admin backoffice pages, and REST API endpoints with auth guards and response semantics.

### Scenario 5: AI subsystems, deterministic guardrails, try-on privacy, and 3-tier provider resolution
Given `/README.md`
When a reader inspects the AI Architecture section
Then it documents:
1. `GuardedChatAssistant` (`lib/chat/guarded-chat-assistant.ts` + `lib/chat/guardrails/*`) answering store policies (`store-knowledge.ts`), published integer-cent prices, category synonyms, variants, and `size_chart` measurements deterministically without calling the LLM, refusing out-of-scope/prompt-injection prompts, and discarding unverified dollar amounts via exact canonical set membership (`answer-guard.ts`).
2. Virtual Try-On (`POST /api/try-on`) pre-flight validation (`lib/try-on/photo-validation.ts`: JPEG/PNG/WebP allowlist, 4 MiB inclusive cap, magic-byte sniffing before any DB/provider call), 30 s `AbortSignal.timeout` bound, retryable failure mapping, and strict zero-persistence in-memory privacy (`Cache-Control: no-store`, no DB table, no disk/object/browser storage, no byte/URL logging).
3. The 3-tier AI provider resolution chain in `lib/chat/index.ts` and `lib/try-on/index.ts`: Tier 1 Google Cloud Vertex AI (`gcp-service-account.json` + RS256 JWT in `lib/ai/google-auth.ts`), Tier 2 Google Gemini API (`GEMINI_API_KEY`), Tier 3 OpenAI / DevExpert compatible gateway (`OPENAI_API_KEY` / `TRYON_API_KEY` -> `DEVEXPERT_API_KEY`).

### Scenario 6: 17 PostgreSQL tables, 7 enums, 7 migrations, seed data, and 10 durable constraints
Given `/README.md`
When a reader inspects the Data Layer section
Then all 17 PostgreSQL tables and 7 `pgEnum` types across migrations `0000_bumpy_lifeguard` through `0006_fresh_zombie` are documented alongside the idempotent insert-if-missing `pnpm db:seed` inventory (6 categories, 9 products across published/draft/archived, 40 variants, 16 SVG images, 30 size-chart rows, 2 shipping methods, and default admin `admin@j-armando.store` / `Admin123!`), the per-file throwaway DB test harness (`db/tests/global-setup.ts` + `harness.ts`), and all 10 durable rules from `CONSTRAINTS.md`.

### Scenario 7: Five or more valid GitHub-renderable Mermaid diagrams
Given `/README.md`
When rendered on GitHub
Then it includes at least 5 syntactically valid `mermaid` fenced code blocks covering: (1) High-Level System & Hexagonal Ports-and-Adapters Architecture (`flowchart`), (2) Chat Assistant Deterministic Guardrail & LLM Fallback Pipeline (`flowchart`), (3) Virtual Try-On In-Memory Privacy & Multi-Provider Sequence (`sequenceDiagram`), (4) Guest-First Checkout, Atomic Stock Reservation & Account Creation/Linking Sequence (`sequenceDiagram`), and (5) PostgreSQL 17-Table Entity-Relationship Diagram (`erDiagram`) plus Product/Order/Fulfillment Lifecycle State Machines (`stateDiagram-v2`).

### Scenario 8: Local quickstart, `./init.sh` gate, mobile preview rule, SDD workflow, and passing gate
Given `/README.md` and the repository workspace
When a developer follows the quickstart and runs `./init.sh` and `pnpm build`
Then the README documents step-by-step setup (with and without local Postgres via `pnpm db:devdb`), `.env.example` variables, all `package.json` scripts, mobile testing via `pnpm dev:phone` + QR code generation, and the SDD multi-agent workflow (`build-brief`, `harness-starter`, `feature-spec`, `feature-implementer`, `feature-validator`, `feature-flow`, `github-flow`)
And `./init.sh` and `pnpm build` both exit 0 with zero regressions.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json` — repo workflow, 31 accepted features + `repository-readme` verification requirements and notes.
- `ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md` — runtime surface, layering, 10 durable constraints, glossary, editorial design tokens.
- `package.json`, `.nvmrc`, `.env.example`, `init.sh`, `vitest.config.mts`, `drizzle.config.ts` — exact package versions, scripts, env template, and gate contract.
- `db/schema/{index,enums,catalog,account,cart,order}.ts` & `db/migrations/meta/_journal.json` (`0000`–`0006`) — 17 tables and 7 enums.
- `db/seed.ts`, `db/seed-data.ts`, `db/order.ts`, `db/auth.ts`, `db/cart.ts`, `db/checkout.ts`, `db/admin-products.ts`, `db/admin-orders.ts` — seed inventory, atomic stock decrement (`UPDATE variant SET stock_qty = stock_qty - qty WHERE id = ? AND stock_qty >= qty`), scrypt/OTP auth, and admin repositories.
- `lib/ai/google-auth.ts`, `lib/chat/index.ts`, `lib/chat/guarded-chat-assistant.ts`, `lib/try-on/index.ts`, `lib/try-on/photo-validation.ts`, `lib/email/email-service.ts`, `lib/tax/sales-tax.ts`, `payments/payment-provider.ts` — ports, decorators, 3-tier AI resolution, tax table, and simulated adapters.
- `app/**/{page,route}.ts*` & `docs/adr/0001..0004*.md` — full route inventory and accepted ADRs.

### Existing Patterns To Follow

- All documentation and UI copy must be in English (`AGENTS.md`).
- Mermaid node labels containing parentheses, slashes, or special characters must be quoted (`id["Label (Detail)"]`) so GitHub renders them without parse errors.
- `./init.sh` is non-blocking (runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and exits 0 without starting `pnpm dev` or requiring `DATABASE_URL` or API keys).

### Current Gaps

- No `README.md` exists at the repository root.
- `ARCHITECTURE.md` status/layout paragraphs were written incrementally and can optionally be kept in sync or referenced cleanly from `README.md`.

## Technical Approach

Create `README.md` at `/Users/armando/Documents/tienda-worktrees/repository-readme/README.md` structured into 11 clear, navigable sections with a Table of Contents:

1. **Header & Executive Summary:** Brand identity (**J. Armando**), value proposition, US/USD tax-exclusive domain rules, key architectural highlights, and quick links to all durable docs (`ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`, `docs/*`, `docs/adr/*`).
2. **Editorial Design System & Brand Philosophy:** Zero-radius rectilinear geometry (only AI status pips and color swatches are circular), typography (`Newsreader` editorial serif + `Hanken Grotesk` geometric sans), palette (`#121212` charcoal ink, `#F9F8F5` warm ivory alabaster, `#4A5568` slate-steel AI surfaces), and adaptation from the `stitch_image_based_application/` proposal.
3. **Functional Capabilities & Roles Matrix:** Role permissions (`Guest`, `Customer`, `Admin`) and a comprehensive summary of all 31 accepted MVP features grouped by domain (`Catalog & Size Guides`, `Guest Cart`, `3-Step Guest-First Checkout & US Sales Tax`, `Simulated Payments & Atomic Stock Reservation`, `Identity & Password/OTP Auth`, `Customer Order History & Confirmation Emails`, `Admin Backoffice`, `Guarded Chat Assistant`, `Virtual Try-On`).
4. **Technology Stack, Toolchain & Libraries Inventory:** Complete tables of runtime/toolchain pins (`Node.js v24.21.0`, `pnpm 12.11.2`, native `--experimental-strip-types`), production dependencies (`next 16.4.0`, `react 19.3.0`, `react-dom 19.3.0`, `drizzle-orm ^0.45.4`, `pg ^8.23.1`), dev/test libraries (`typescript ^5 / 5.9.3`, `drizzle-kit 0.31.11`, `embedded-postgres 17.10.0-beta.17`, `vitest ^5.0.3`, `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.2`, `jsdom ^30.1.2`, `@vitejs/plugin-react ^6.1.2`, `eslint ^9`, `eslint-config-next 16.4.0`), and zero-SDK `node:crypto` primitives.
5. **Hexagonal (Ports & Adapters) Architecture:** Dependency rule (`app/` -> `lib/` & `payments/` -> `db/` -> PostgreSQL), repository directory tree, and detailed breakdown of all 4 ports (`ChatAssistant`, `TryOnProvider`, `PaymentProvider`, `EmailSender`/`AccessCodeEmailSender`) and their adapters, accompanied by **Mermaid Diagram 1 (System & Hexagonal Architecture Flowchart)**.
6. **Complete Route & API Surface:** Structured tables for Public Storefront Pages (`/`, `/catalog`, `/products/[slug]`, `/cart`, `/checkout`, `/checkout/confirmation/[reference]`), Customer Account Pages (`/account/signin`, `/account`, `/account/orders`, `/account/orders/[reference]`), Admin Backoffice Pages (`/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/orders`, `/admin/orders/[reference]`), and all REST API Endpoints (`/api/cart/lines`, `/api/checkout/contact-and-address`, `/api/checkout/shipping-method`, `/api/checkout/pay`, `/api/auth/*`, `/api/admin/*`, `/api/chat`, `/api/try-on`).
7. **AI Subsystems: Deterministic Guardrails, In-Memory Privacy & 3-Tier Provider Resolution:**
   - 3-tier lazy provider resolution (`Vertex AI` via `gcp-service-account.json` & RS256 JWT in `lib/ai/google-auth.ts` -> `Google Gemini` via `GEMINI_API_KEY` -> `OpenAI / DevExpert Gateway` via `OPENAI_API_KEY` / `TRYON_API_KEY`).
   - `GuardedChatAssistant` deterministic pipeline (`store-knowledge.ts`, `intents.ts`, `product-match.ts`, `answer.ts`, `answer-guard.ts` exact canonical dollar-amount set membership) + **Mermaid Diagram 2 (Chat Guardrails Flowchart)**.
   - Virtual Try-On pre-flight validation (`photo-validation.ts`: JPEG/PNG/WebP, 4 MiB inclusive cap, magic-byte signature check), 30 s `AbortSignal.timeout`, retryable failure states, and zero-persistence in-memory privacy model + **Mermaid Diagram 3 (Virtual Try-On Sequence Diagram)**.
8. **Guest-First Checkout, Atomic Stock Reservation & Identity Lifecycle:** Step-by-step walk-through of `createPaidOrderFromCheckout` (`db/order.ts`), destination state sales tax (`lib/tax/sales-tax.ts`), deterministic `variantId` sorting to prevent deadlocks, atomic conditional stock decrement (`stock_qty >= qty`), account creation/linking with optional Quick Access scrypt password, and non-blocking confirmation email + **Mermaid Diagram 4 (Checkout & Stock Reservation Sequence Diagram)**.
9. **PostgreSQL Data Layer, 17 Tables, Migrations & Seeds:**
   - Complete table & enum inventory across migrations `0000_bumpy_lifeguard` through `0006_fresh_zombie`.
   - **Mermaid Diagram 5 (Entity-Relationship `erDiagram` of all 17 tables)** and **Mermaid Diagram 6 (`stateDiagram-v2` for Product, Order, Payment, and Fulfillment lifecycles)**.
   - Idempotent `pnpm db:seed` inventory (including default admin `admin@j-armando.store` / `Admin123!`) and the ephemeral `embedded-postgres` test harness.
10. **Durable Engineering Constraints & ADRs:** All 10 MUST/MUST NOT rules from `CONSTRAINTS.md` and summary table of ADRs `0001`–`0004`.
11. **Local Development Quickstart, Verification Gate & SDD Multi-Agent Workflow:** Prerequisites, setup with/without local Postgres (`pnpm db:devdb`), `.env.example` table, `package.json` command reference, `./init.sh` contract, mobile phone preview with QR code rule (`pnpm dev:phone`), and the SDD multi-agent pipeline (`build-brief`, `harness-starter`, `feature-spec`, `feature-implementer`, `feature-validator`, `feature-flow`, `github-flow`).

## Expected File Changes

- `README.md` — **create**; comprehensive English root documentation satisfying all 9 verification criteria in `feature_list.json`.
- `feature_list.json` & `PROGRESS.md` — **modify** (by implementer/validator at verification time); record verification evidence and status transition.

## Visual Design Impact

- UI involved: no (Markdown documentation only; no storefront CSS or React component changes).
- Design source: `DESIGN.md` is documented accurately in `README.md` (brand mapping, typography, `#121212` / `#F9F8F5` / `#4A5568` color tokens, zero-radius geometry).
- Screens or states affected: none.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: **not needed** — `README.md` links to `ARCHITECTURE.md` and documents the full 31-feature state without conflicting with `ARCHITECTURE.md`.
- `CONSTRAINTS.md`: **not needed** — all 10 existing durable constraints are preserved and summarized in `README.md`.
- `AGENTS.md`: **not needed** — agent startup workflow and command table are unchanged.
- Other docs: `README.md` (**create**) at the repository root.

## Implementation Plan

1. Draft and write `/README.md` covering all required sections, tables, relative links, and 6 GitHub-flavored Mermaid diagrams (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`).
2. Verify every relative markdown link in `README.md` resolves to an existing file or directory in the repository, and verify all Mermaid blocks have balanced fences and quoted special-character labels.
3. Run `./init.sh` (which executes `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) and `pnpm build` (with provider/DB env vars unset) to confirm zero regressions, then record evidence in `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Create `README.md` with executive summary, table of contents, US/USD tax-exclusive domain rules, editorial zero-radius design system (`DESIGN.md`), user roles (`Guest`, `Customer`, `Admin`), and 31-feature MVP matrix.
- [ ] Document the complete technology stack, toolchain pins (`Node v24.21.0`, `pnpm 12.11.2`), production/dev libraries from `package.json` with exact versions, and `node:crypto` usage.
- [ ] Document the Hexagonal Ports & Adapters architecture (`ChatAssistant`, `TryOnProvider`, `PaymentProvider`, `EmailSender`/`AccessCodeEmailSender`), repository layout, and complete route/API surface tables.
- [ ] Document the AI architecture deep-dive: 3-tier provider resolution (`Vertex AI` RS256 JWT -> `Gemini API` -> `OpenAI / DevExpert`), `GuardedChatAssistant` deterministic pipeline & exact dollar-amount set guard, and Virtual Try-On pre-flight validation (4 MiB, JPEG/PNG/WebP, magic bytes), 30 s timeout, and zero-persistence in-memory privacy.
- [ ] Document the 17 PostgreSQL tables, 7 `pgEnum`s, 7 Drizzle migrations (`0000`–`0006`), idempotent seed (`pnpm db:seed` including `admin@j-armando.store` / `Admin123!`), `embedded-postgres` test strategy, and 10 durable rules from `CONSTRAINTS.md`.
- [ ] Include at least 5 (target 6) valid GitHub-renderable Mermaid diagrams: (1) System & Hexagonal Architecture `flowchart`, (2) Chat Guardrails `flowchart`, (3) Virtual Try-On Privacy & Provider Fallback `sequenceDiagram`, (4) Guest-First Checkout & Atomic Stock Reservation `sequenceDiagram`, (5) 17-Table PostgreSQL `erDiagram`, and (6) Product/Order/Fulfillment Lifecycle `stateDiagram-v2`.
- [ ] Document local quickstart (with and without local Postgres via `pnpm db:devdb`), `.env.example` variables, CLI scripts, `./init.sh` gate contract, mobile preview QR workflow (`pnpm dev:phone`), ADRs `0001`–`0004`, and SDD multi-agent skills.
- [ ] Verify all relative links in `README.md` exist on disk, run `./init.sh` and `pnpm build`, and update `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- Structural & content verification (Node/shell checks):
  - Confirm `README.md` exists at repo root and is non-empty.
  - Parse all relative links `[...](path)` in `README.md` and assert every target path exists in the repository (`ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md`, `feature_list.json`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/mvp-scope.md`, `docs/risks-and-open-questions.md`, `docs/adr/`).
  - Confirm at least 5 `mermaid` fenced code blocks exist covering `flowchart`, `sequenceDiagram`, `erDiagram`, and `stateDiagram-v2`.
  - Confirm all 17 table names, all 4 port names, all 3 AI tiers, and all `package.json` dependencies are present in `README.md`.
- Automated gate:
  - Run `./init.sh` — must execute `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (94 test files / 640 tests) and exit 0 without starting `pnpm dev`.
  - Run `pnpm build` — must exit 0.
- E2E: No browser E2E harness exists (`ARCHITECTURE.md`), and this feature is a Markdown documentation deliverable with no runtime UI/API changes.

## Evidence To Capture

- Output of link/section/Mermaid verification script against `README.md` (link count, Mermaid diagram count, table/library checklist).
- `./init.sh` exit 0 transcript (lint, typecheck, and Vitest `ui` + `db` test counts).
- `pnpm build` exit 0 transcript.
- Updated `feature_list.json` (`repository-readme` status and evidence) and `PROGRESS.md` session entry.

## Validator Checklist

- [ ] Implementation stays strictly within `repository-readme` scope (`README.md` plus harness state updates; no application code modified).
- [ ] Acceptance scenarios 1–8 and all 9 verification criteria in `feature_list.json` pass.
- [ ] All relative markdown links in `README.md` resolve to existing files/directories.
- [ ] At least 5 valid GitHub-flavored Mermaid diagrams (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`) are included with properly quoted labels.
- [ ] All 17 PostgreSQL tables, 7 enums, 7 migrations, 4 hexagonal ports, 3 AI provider tiers, 10 `CONSTRAINTS.md` rules, and all `package.json` libraries/versions are accurately documented.
- [ ] `./init.sh` and `pnpm build` pass with exit code 0.
- [ ] `feature_list.json` and `PROGRESS.md` are updated accurately by the implementer.
