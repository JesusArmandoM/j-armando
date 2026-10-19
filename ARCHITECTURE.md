# Architecture

Runtime and tooling boundaries for **J. Armando**. Update this file when domains, layers, runtime surfaces, dependency direction, adapters/providers or other architectural boundaries change.

## Status

The application shell, the PostgreSQL data layer, the catalog storefront (listing with URL-driven filtering/sorting) and the product detail page exist. The `PaymentProvider` port and its simulated adapter are realised in `payments/` (port, adapter, outcome mapping) with a presentational checkout outcome surface; the storefront chat assistant is realised behind the `ChatAssistant` port in `lib/chat/` (provider-agnostic port, OpenAI adapter, env-driven factory) with `POST /api/chat` and the `app/chat/` panel. Chat answers are guarded deterministically: policy facts come from a repo-owned knowledge module, prices and published size-chart measurements from catalog rows, and unrelated requests are refused before the LLM is called (`docs/adr/0004-chat-assistant-guardrails.md`). Shipping cost is a verified policy (free standard / $15 express) and product pages show the published category size guide. Virtual try-on is realised behind the `TryOnProvider` port in `lib/try-on/` (port, OpenAI-compatible images adapter, simulated adapter, env-driven factory) with `POST /api/try-on` and the product-page try-on panel; photos and results are processed in memory only (no persistence), with 4 MiB/JPEG-PNG-WebP validation before any provider call, a 30 s provider timeout and graceful timeout/error retry in the panel. The guest cart is realised for the add + view slice: a shopper can add a selected variant (quantity 1–10) through `POST /api/cart/lines` and see the session cart at `/cart` (`db/cart.ts`, `app/cart/`). Quantity editing/removal, stock caps, checkout, orders, identity/account linking, cart merging and payments against a real gateway are not implemented yet. See `feature_list.json` for what is planned and `docs/technical-discovery.md` for the technology decisions.

## Toolchain Pin

| Tool | Version | How it is managed |
| --- | --- | --- |
| Node.js | `v24.21.0` | `nvm`, pinned by `.nvmrc` and `package.json` `engines` (`>=24.0.0`) |
| pnpm | `12.11.2` | Corepack, pinned by `package.json` `packageManager` |
| TypeScript | `^5` (5.9.3) | dev dependency |
| ESLint | `^9` (9.39.5) | dev dependency, `eslint-config-next` |

Node is installed in user space at `~/.nvm`. Nothing is installed system-wide and no `sudo` is required. `init.sh` sources `~/.nvm/nvm.sh` when the calling shell has not already loaded it.

> Note: `create-next-app`'s canonical config pins `@types/node` to `^20`, which conflicts with `vitest@5`'s peer requirement of `^22 || >=24`. This repo uses `@types/node: ^24` to match the pinned Node runtime. Do not regress it.

## Runtime Surface

- **Framework:** Next.js `16.4.0`, App Router, React `19.3.0`.
- **Rendering:** `/` prerenders as static content. DB-backed routes (`/catalog`, `/products/[slug]`, `/cart`, `/checkout`) are `force-dynamic` and render on demand; the cart and checkout also depend on the request cookie. Next 16 `searchParams` is a `Promise<Record<string, string | string[] | undefined>>` that a page `await`s.
- **Route surface (public, read-only):**
  - `/` — landing page.
  - `/catalog` — published product grid (dynamic; `catalog-product-listing`) with URL-driven filter/sort state (`catalog-filtering`).
  - `/products/[slug]` — published product detail by public slug (dynamic; `product-detail-page`) with size/color variant selection (`product-variant-selection`), the published category size guide (`catalog-size-chart`) and the guest add-to-cart control (`guest-cart-add`). Draft, archived and unknown slugs call `notFound()` (HTTP 404). The page also mounts the try-on panel (`virtual-tryon-generation`), fed with the product's non-discontinued variants as garment context only.
  - `/cart` — session-scoped guest cart view (dynamic; `guest-cart-add`, `guest-cart-manage`, `checkout-contact-and-address`). With no `ja_cart_session` cookie it renders the empty state without touching the database or minting a cookie. Otherwise it shows each line's product, size/color, quantity stepper, unit price, line total, remove action, the integer-cent subtotal via `formatPriceUSD`, plus the USD/tax-exclusive note and "Proceed to Checkout" action linking to `/checkout`. DB failure → temporary-unavailable state.
  - `/checkout` — session-scoped checkout flow (dynamic; `checkout-contact-and-address`). Requires an active guest cart; renders the order summary alongside Step 1 (Contact Email and Shipping Address form or completed summary card) and Step 2 indicator (Shipping Method). Empty cart → empty checkout state.
  - `/account` — protected customer account overview (dynamic; `account-signin-signout`). Requires an active session via `ja_account_session`; unauthenticated visits redirect to `/account/signin`. Displays customer email, roles, and a Sign Out button.
  - `/account/signin` — customer sign-in portal with Password and Email Code tabs (dynamic; `account-signin-signout`). Authenticated visitors redirect to `/account` or query parameter `returnUrl`.
  - `/admin` — protected backoffice dashboard (dynamic; `admin-role-gate`). Guarded by `getAdminSession`.
  - `/admin/products` — backoffice product list across all lifecycle statuses (`draft`, `published`, `archived`), showing variant counts and total stock (`admin-product-create`).
  - `/admin/products/new` — backoffice form to create a draft product with size/color variants and per-variant stock (`admin-product-create`).
  - `/admin/products/[id]` — backoffice product detail view displaying garment metadata and variant inventory table (`admin-product-create`).
  - `/admin/orders` — protected backoffice order list across all customers (dynamic; `admin-order-list`). Guarded by `getAdminSession`; displays reference, date, customer email, item count, payment/fulfillment status badges, and USD totals.
  - `/admin/orders/[reference]` — protected read-only backoffice order detail across any customer (dynamic; `admin-order-list`). Guarded by `getAdminSession`; unknown references call `notFound()`.
  - `GET /api/admin/orders` and `GET /api/admin/orders/[reference]` — read-only admin order endpoints (`admin-order-list`), guarded by `getAdminSession` with `Cache-Control: no-store`.
  - `POST /api/chat` — stateless chat endpoint (dynamic; `chat-assistant`), guarded before the provider is called (`chat-assistant-guardrails`). Malformed body → 400, unconfigured provider → 503, provider error → 502.
- **Route surface (mutating):**
  - `GET /api/admin/products` & `POST /api/admin/products` — admin-guarded product listing and transactional draft product + variant creation (`admin-product-create`). Unauthenticated → 401; non-admin → 403; invalid input → 400 with field errors; created → 201 `{ ok: true, product }`. Always `Cache-Control: no-store`.
  - `POST /api/auth/signin` — authenticates with email and password (`account-signin-signout`). On success, creates a session in `account_session` and sets the `ja_account_session` cookie; returns `{ ok: true, account }`. Invalid credentials → 401.
  - `POST /api/auth/request-code` — dispatches a 6-digit OTP code to the account email for passwordless sign-in (`account-signin-signout`). Invalid or nonexistent email → 404. Success → 200 `{ ok: true }`.
  - `POST /api/auth/verify-code` — verifies the 6-digit OTP code (`account-signin-signout`). Single-use: deletes code upon verification. On success, creates a session and sets the `ja_account_session` cookie; returns `{ ok: true, account }`. Invalid or expired code → 400.
  - `POST /api/auth/signout` — revokes session in `account_session` and clears `ja_account_session` cookie (`account-signin-signout`). Returns `{ ok: true }`.
  - `GET /api/auth/me` — returns authenticated state and account roles (`account-signin-signout`). Unauthenticated → `{ authenticated: false }`.
  - `POST /api/cart/lines` — guest cart add (`guest-cart-add`). JSON body `{ variantId, quantity }` only (quantity integer 1–10); the cart is resolved exclusively from the `ja_cart_session` cookie and the price from the database. Success → 200 `{ lineQuantity }` (no cart/line id, no token); unknown/unavailable variant or invalid input → 400; unexpected write failure → 503; always `Cache-Control: no-store`. The first successful add mints the opaque httpOnly cookie.
  - `PATCH /api/cart/lines` — guest cart line quantity update (`guest-cart-manage`). JSON body `{ lineId, quantity }` (quantity integer 1–10); validates line belongs to the session cart. Success → 200 `{ lineId, lineQuantity }`; invalid input → 400; not found or wrong session → 404; failure → 503; always `Cache-Control: no-store`.
  - `DELETE /api/cart/lines` — guest cart line removal (`guest-cart-manage`). JSON body `{ lineId }`; validates line belongs to the session cart. Success → 200 `{ lineId, removed: true }`; invalid input → 400; not found or wrong session → 404; failure → 503; always `Cache-Control: no-store`.
  - `POST /api/checkout/contact-and-address` — guest checkout step 1 save (`checkout-contact-and-address`). JSON body `{ email, recipientName, line1, line2, city, state, zip, country, phone }`; validates required fields, RFC email format, US 2-letter state and 5-digit/9-digit ZIP code. Cart is resolved exclusively from `ja_cart_session`. Success → 200 `{ ok: true, checkoutSession }`; validation error → 400 with field errors; no cart → 400; unexpected failure → 503; always `Cache-Control: no-store`. Revalidates `/checkout`.
  - `GET /api/checkout/contact-and-address` — reads existing checkout session for the session cart.
  - `POST /api/try-on` — multipart/form-data (`photo`, `productSlug`, `size`, `color`, `consent=accepted`); validates the photo first (JPEG/PNG/WebP declared type, 4 MiB cap and magic-byte signature, in memory), then resolves a published product + non-discontinued variant, builds the prompt server-side and calls the configured `TryOnProvider`. Always `Cache-Control: no-store`; failures return a fixed `{ error, code }` pair: 400 `invalid_photo` (empty/unsupported/oversized/bad signature, before any catalog or provider work), 400 `invalid_request`/`not_available`/`consent_required`, 503 `provider_unavailable`, 504 `provider_timeout` (the adapter aborts at 30 s by default) and 502 `provider_error`. Photos and results are never persisted, cached or logged.
- **Account authentication and session state:** `ja_account_session` is an opaque `randomBytes(32).toString("base64url")` value, set as an httpOnly cookie (`SameSite=Lax`, `Path=/`, 30-day `Max-Age`, `Secure` in production). Password authentication uses scrypt (`<saltHex>:<keyHex>`) via `verifyPassword`. Passwordless sign-in uses 6-digit numeric OTP codes stored in `account_access_code` with 15-minute expiration, emailed via the access code email service and deleted on successful verification. Sessions are tracked in `account_session` and revoked upon sign out.
- **Guest cart identity and state:** `ja_cart_session` is an opaque `randomBytes(32).toString("base64url")` value, set as an httpOnly cookie (`SameSite=Lax`, `Path=/`, 30-day `Max-Age`, `Secure` in production). It is the only cart credential and stores the same value as `cart.session_token`; `cart.account_id` stays null. No cart/line/session id is ever accepted from the body or query string. Reads never create a cart or mint a cookie; only a successful add does. Repeat adds upsert on the unique `(cart_id, variant_id)` key (`quantity = quantity + n`), so one session has one line per variant.
- **Try-on UI state:** the selected size/color, chosen file, result and failure live only in the panel's React state for the current page session. The picker advertises `image/jpeg,image/png,image/webp`, validates size/type locally and clears an invalid selection; a retryable failure keeps the in-memory photo and consent and labels the action "Try again", while the route remains the byte-signature authority. No localStorage/IndexedDB, no history, no download link. The picker is try-on-local garment context, not the purchase variant.
- **Catalog listing state:** filter/sort state (category, size, color, max price, sort) lives only in the URL query string — no client store. The page parses it (`app/catalog/filter-params.ts`), fetches through the repository, and a client toolbar pushes new `/catalog?...` history entries via `next/navigation`'s `useRouter`. Reset navigates to the bare `/catalog`.
- **Product variant selection state:** the detail page exposes only non-discontinued variants (ordered size then color). Selection is client view state initialized from `?size=&color=` on the server (`parseVariantSelection`) so price and availability update instantly; after a change the client selector mirrors the canonical values into the URL with `window.history.replaceState` (no navigation, no new history entry, no scroll jump). Out-of-stock/unoffered pairs are rejected by both the parser and the selector.
- **Deployment target:** Vercel (see `docs/technical-discovery.md`). Not configured here beyond framework defaults.

### Next.js 16 has breaking changes

Do not rely on training-data knowledge of Next.js. Read the relevant guide under `node_modules/next/dist/docs/` before writing code:

- `01-app/01-getting-started/03-layouts-and-pages.md` — page and layout file conventions
- `01-app/01-getting-started/13-fonts.md` — `next/font` usage
- `01-app/01-getting-started/14-metadata-and-og-images.md` — metadata exports

`next dev` re-adds an agent-rules block to `AGENTS.md` pointing at these docs. Keep that block.

## Repository Layout

```
app/                     Next.js App Router routes and UI
  layout.tsx             Root layout: html/body, global fonts, metadata, <ChatPanel />
  page.tsx               Landing page (placeholder shell)
  catalog/               Catalog listing route + product card (+ URL-driven filters)
  products/[slug]/       Product detail route (/products/[slug]), gallery, size guide, variant selector + pure selection model, add-to-cart control, try-on panel, not-found state
  cart/                  Session cart page (/cart), httpOnly cookie identity helpers, pure add-input validation (+ tests)
  checkout/              Checkout UI (payment outcome surface; the route arrives with checkout-*)
  account/               Customer account portal (/account overview, /account/signin with tabs, SignOutButton)
  globals.css            Design tokens and base styles
  page.test.tsx          Landing page smoke test
  chat/                  Chat panel client component (+ test)
  api/auth/              POST /api/auth/{signin,request-code,verify-code,signout}, GET /api/auth/me (+ tests)
  api/cart/lines/        POST /api/cart/lines guest add route handler (+ test)
  api/chat/              POST /api/chat route + guardrail composition (+ tests)
  api/try-on/            POST /api/try-on route handler (+ test)
payments/                Payment port + simulated adapter (framework-agnostic; no next/react/db)
  payment-provider.ts    Port types, PaymentEvent union, PaymentProvider interface
  simulated-provider.ts  Deterministic simulated adapter (succeed/fail/pending)
  payment-outcome.ts     Pure event -> presentation view mapping
lib/                     Application-layer ports and shared framework-agnostic helpers (no next/react/db)
  money.ts               USD formatter used by the data layer and the mapper
  auth/                  Password hashing/verification (scrypt) and session cookie helpers
  email/                 Order confirmation and access-code email templates + simulated senders (+ tests)
  chat/                  ChatAssistant port, OpenAI adapter, guardrail decorator, env factory (+ tests)
    guardrails/          Repo-owned store knowledge, intents, product matching, answer guard
  try-on/                TryOnProvider port, images adapter, simulated adapter, prompt builder, env factory (+ tests)
db/                      Data layer: Drizzle schema, migrations, seed, scripts
  auth.ts                Auth repository (password authentication, session lifecycle, passwordless OTP)
  cart.ts                Guest cart repository (addable variant, get-or-create cart, line upsert, summary)
  checkout.ts            Checkout repository (get checkout session, save contact and address)
  schema/                Table + enum definitions (catalog, account, cart, order)
  migrations/            Generated SQL migrations (committed; never hand-edited)
  tests/                 DB integration tests + embedded-Postgres globalSetup
  seed-data.ts           Demo catalog content (English copy, USD cents)
public/images/products/  Placeholder product images used by the seed
docs/                    Discovery documents (English) and specs
  specs/                 One implementation spec per feature
  adr/                   Architecture decision records
stitch_image_based_application/   Design reference only — NOT a specification
drizzle.config.ts        drizzle-kit configuration (reads DATABASE_URL)
.env.example             Environment template (copy to .env.local, gitignored)
init.sh                  Standard startup + verification gate (non-blocking)
feature_list.json        Source of truth for feature state
PROGRESS.md              Verified state and session log
AGENTS.md                Agent operating rules
ARCHITECTURE.md          This file
CONSTRAINTS.md           Durable MUST/MUST NOT rules
```

## Standard Gate

`./init.sh` is the single entry point for startup and verification. Contract:

1. It **executes** the non-blocking checks: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
2. It **must not** start long-running processes such as `pnpm dev`.
3. It **may** print manual follow-up commands after the checks pass.
4. It fails fast via `set -euo pipefail`.

Individual commands are also available as `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, plus the database commands `db:generate`, `db:migrate`, `db:seed`, `db:verify` and `db:devdb` (see Data Layer below).

## Verification Stack

| Level | Tool | Command |
| --- | --- | --- |
| Lint | ESLint (`eslint-config-next`) | `pnpm lint` |
| Types | `tsc --noEmit` | `pnpm typecheck` |
| Unit/component | Vitest + Testing Library (jsdom) | `pnpm test` (project `ui`) |
| DB integration | Vitest (node) + embedded PostgreSQL 17 | `pnpm test` (project `db`) |
| Production build | `next build` | `pnpm build` |
| Browser E2E | **not present** | — |

Vitest runs two projects (`vitest.config.mts`): `ui` (jsdom) and `db` (node, PostgreSQL integration). Both run with `globals: true`. In the `ui` project this is required: `@testing-library/react` only registers its automatic `afterEach` cleanup when `afterEach` is globally available. Setting `globals: false` silently leaks DOM between tests.

There is no persistent browser E2E harness yet. Focused E2E coverage becomes required from the first feature with a real user flow (`catalog-product-listing` onward).

## Data Layer

The data-access layer is **Drizzle ORM** (`drizzle-orm` + `drizzle-kit` over `pg`), decided in `bootstrap-database-schema` and recorded in `docs/adr/0002-drizzle-data-access-layer.md`. All storage goes through `db/`; features never talk to `pg` directly.

- **Schema:** `db/schema/` — Drizzle tables and PostgreSQL enums grouped by domain (`catalog.ts`, `account.ts`, `cart.ts`, `order.ts`). Scope today: catalog/cart/order/account. AI-side conversation/message tables belong to later features. Virtual try-on deliberately has **no** table or column (photos/results are in-memory per request until blocking privacy question #3 is decided; see `CONSTRAINTS.md` → Try-on privacy). Collections and tax rates belong to later features; `shipping_method` rows are seeded for the checkout feature, and `size_chart` holds published category body measurements.
- **Conventions:** money is `bigint` **integer cents** with `currency char(3) default 'USD'` and catalog prices tax-exclusive (US market); timestamps are `timestamptz`; ids are `uuid` with `gen_random_uuid()`. Variant availability (`available` / `out_of_stock` / `discontinued`) is derived, never stored.
- **Cart repository:** `db/cart.ts` is the only cart data access. `getAddableVariant` joins `variant → product` and accepts only published, non-discontinued, in-stock rows; `getOrCreateCart` selects by `session_token` and inserts once (`ON CONFLICT DO NOTHING` on the unique token, then re-selects for concurrent creators), never setting `account_id`; `addVariantToCart` resolves the variant before creating anything and upserts the line inside a transaction on the unique `(cart_id, variant_id)` key by adding to the existing quantity; `getCartSummary` is one joined read (`cart → cart_line → variant → product`) of the active cart, deriving `unitPriceCents = price_override_cents ?? base_price_cents`, integer-cent line totals and their sum. That layer, not the route, owns HTTP-free cart rules.
- **Checkout repository:** `db/checkout.ts` manages in-flight checkout state. `getCheckoutSession` joins `cart → checkout_session` by `session_token`; `saveCheckoutContactAndAddress` resolves the active cart from the session token and performs a transactional upsert on `(cart_id)`, persisting contact email and US shipping address data while updating `updatedAt`.
- **Migrations:** `pnpm db:generate` writes SQL to `db/migrations/` once; the output is committed. Applied migrations are tracked (`drizzle.__drizzle_migrations`), so `pnpm db:migrate` is idempotent. Never edit an applied migration — generate a new one (`CONSTRAINTS.md`).
- **Seed:** `pnpm db:seed` loads `db/seed-data.ts` (demo catalog: 6 categories, 9 products across published/draft/archived, 40 variants, 16 images, 30 size-chart rows and 2 shipping methods) with strict insert-if-missing semantics — `ON CONFLICT DO NOTHING` on natural keys in one transaction; never updates, never deletes. `pnpm db:verify` asserts the catalog is populated and exits non-zero on an empty catalog.
- **Connection:** everything connects through `DATABASE_URL` (`db/client.ts`). `.env.example` documents it; copy it to `.env.local` (gitignored) or export the variable. All `db:*` commands load `.env.local`/`.env` themselves when the variable is not exported (`db/env.ts`; `drizzle.config.ts` calls it too, so `pnpm db:migrate` behaves like `db:seed`/`db:verify`). Provider choice (Neon vs Supabase) stays open behind this URL.
- **Env precedence:** an exported `DATABASE_URL` always wins over file contents (`process.loadEnvFile` never overwrites). When both `.env` and `.env.local` define it, `db:seed`/`db:verify` prefer `.env.local` (loaded first by `db/env.ts`) while `db:migrate` prefers `.env` (drizzle-kit pre-loads `.env` before `drizzle.config.ts` runs) — keep `DATABASE_URL` in a single file to avoid ambiguity (verified 2026-10-12).
- **Script runtime:** the `db:*` TypeScript scripts run with **Node 24 native type stripping** — erasable syntax only (Drizzle `pgEnum` + string unions instead of TS `enum`/`namespace`) and explicit `.ts` import extensions (enabled via `allowImportingTsExtensions` in `tsconfig.json`); `db/package.json` marks the directory as ESM. The `tsx` fallback was not needed. `drizzle-kit` loads `drizzle.config.ts` with its own loader.

### Test database strategy

The automated gate must stay self-contained on machines with no Docker and no system PostgreSQL (`CONSTRAINTS.md`):

- The `db` Vitest project boots **one ephemeral embedded PostgreSQL 17** per test run (`embedded-postgres`, real PostgreSQL binaries) in `db/tests/global-setup.ts`, on a free port and in a temp data directory. The teardown stops the server and removes the directory; nothing is left running.
- Each test file creates its own throwaway database on that server (`db/tests/harness.ts`), so test files run in parallel against isolated state.
- Local development points `DATABASE_URL` at any real PostgreSQL; `pnpm db:devdb` boots a disposable embedded server for machines that have none and prints the URL to use. Its shutdown is handled by `embedded-postgres`'s exit hook (verified: no process and no data directory survive Ctrl-C).
- Deployed environments use managed PostgreSQL behind the same `DATABASE_URL`; provisioning is out of scope.

## Layering Intent

Partially realised in code; this is the direction to preserve:

- **UI (App Router routes)** → calls application services → **domain** → **ports** (interfaces) → **adapters** (real implementations).
- External capabilities sit behind ports so they can be swapped or simulated without touching store code:
  - **`ChatAssistant` — realised** in `lib/chat/`: the port (`chat-assistant.ts`) is provider-agnostic and now carries an optional `ChatAnswerContext` (`verifiedFacts`, `instructions`); `openai-chat-assistant.ts` is the OpenAI Chat Completions adapter; `index.ts` is the env-driven factory (`getChatAssistant()`). The UI (`app/chat/chat-panel.tsx`) talks only to `POST /api/chat` and imports only the port types, so swapping the adapter needs no UI change.
  - **Chat guardrails — realised** (2026-10-19, `chat-assistant-guardrails`): `guarded-chat-assistant.ts` is a `ChatAssistant` decorator. It answers policy questions verbatim from the repo-owned `guardrails/store-knowledge.ts`, prices only from the published-only `listPublishedProductFacts` query in `db/catalog.ts` (integer cents formatted by `lib/money.ts`), and out-of-scope/prompt-injection asks with a fixed refusal — all without invoking the provider. Generic category words match the published product(s) in that category, and explicit sizing/fit, style/material/care and availability asks are answered deterministically from published category, variant (size/color/stock), product and size-chart facts; missing body measurements or a size chart are stated as unpublished. Only open-ended in-scope conversation reaches the adapter, with the expanded verified facts injected as system context; `guardrails/answer-guard.ts` discards replies containing unverified dollar amounts. `app/api/chat/composition.ts` wires knowledge, the lazy DB reader and the lazy provider; importing it opens no pool and needs no key. Policy/price facts are never sourced from the LLM (ADR 0004, `CONSTRAINTS.md`).
  - **`PaymentProvider` — realised** (2026-10-14, `payment-provider-abstraction`): the framework-agnostic port (`PaymentOutcome`, the `PaymentEvent` discriminated union `payment.succeeded | payment.failed | payment.pending`, and the single-method `PaymentProvider.createPayment`) lives in `payments/payment-provider.ts`; the deterministic simulated adapter is `payments/simulated-provider.ts` (`createSimulatedPaymentProvider`, id `"simulated"`); the pure outcome mapping is `payments/payment-outcome.ts` (`describePaymentOutcome`, which carries integer `amountCents` and renders `amountLabel`); and the presentational checkout surface is `app/checkout/payment-outcome.tsx`. None of these modules import `next`/`react`/`db` code, so a real gateway can replace the simulation behind the same interface without touching the mapper or component. Money formatting is shared: the pure `formatPriceUSD` lives in the framework-agnostic `lib/money.ts` and is imported by the mapper and re-exported by `db/catalog.ts`. Asynchronous confirmation is designed in now: `pending` is a first-class event, not collapsed into a boolean.
  - **`TryOnProvider` — realised** (2026-10-19, `virtual-tryon-generation`): the framework-agnostic port (`TryOnPhoto`, `TryOnRequest`, the `TryOnImage` base64/url union, `TryOnResult` and the single-method `TryOnProvider.generateTryOn`) lives in `lib/try-on/try-on-provider.ts`; the OpenAI-compatible images adapter is `lib/try-on/openai-images-try-on-provider.ts` (`POST {baseUrl}/images/edits`, multipart, Bearer auth, `b64_json` preferred, `timeoutMs` default 30 s via `AbortSignal.timeout`); `lib/try-on/simulated-try-on-provider.ts` is the deterministic in-process adapter; the pure prompt builder is `lib/try-on/prompt.ts`; and `lib/try-on/index.ts` is the env-driven factory (`getTryOnProvider()`). `lib/try-on/photo-validation.ts` holds the shared 4 MiB / JPEG-PNG-WebP / magic-byte validation used by both the route (authoritative) and the panel (convenience). The route (`app/api/try-on/route.ts`) and panel (`app/products/[slug]/try-on-panel.tsx`) depend only on the port, so swapping the provider needs no route or UI change. Failure hardening (invalid photo, 30 s timeout, fixed codes/copy and same-photo retry) shipped in `virtual-tryon-failure`.
- Catalog, cart and order rules belong in the domain layer, not in React components or route handlers.
- Storage goes through the Drizzle data-access layer in `db/` (ADR 0002); features depend on `db/` repositories, never on raw `pg` access.

### AI provider configuration

The chat provider is configured through environment variables, read lazily at request time so the app builds and boots without a key:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | to answer | — | Provider key. Missing → `POST /api/chat` returns 503; the panel shows an error line. |
| `CHAT_ASSISTANT_MODEL` | no | `gpt-4o-mini` | Model sent to the provider. |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | Endpoint root, for a compatible gateway. |

Virtual try-on is configured through its own variables, also read lazily at request time:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TRYON_BASE_URL` | to generate | — | Images API base **including `/v1`**; the adapter appends `/images/edits`. |
| `TRYON_MODEL` | to generate | — | Image-edit model (e.g. `image-edit`). |
| `TRYON_API_KEY` | no | — | Provider key; falls back to `DEVEXPERT_API_KEY`, then `OPENAI_API_KEY`. Missing all three → `POST /api/try-on` returns 503. |

The automated test suite never calls either live provider: both adapters are exercised with an injected `fetch` and an in-process HTTP server (`CONSTRAINTS.md`).

The provider is only reached for open-ended in-scope conversation. Policy, price, explicit sizing/product-info and out-of-scope answers are produced deterministically by `lib/chat/guarded-chat-assistant.ts` and work even when `OPENAI_API_KEY` is missing. There is no additional provider, vector store or retrieval service for chat; the verified source is the code-reviewed knowledge module plus the catalog database (ADR 0004).

## Known Open Points

- **Design token conflict.** `DESIGN.md` records a discrepancy between the design-system front matter (`primary: #000000`) and its prose ("Never pure digital black", `#121212`). The landing page uses the prose values (`#121212` ink, `#F9F8F5` canvas). Unresolved — listed in `DESIGN.md` open design questions.
- **Styling approach is undecided.** Only plain CSS with custom properties is in use. Do not commit the project to a styling system until that decision is made deliberately.
