# Feature Implementation Spec: PostgreSQL schema is defined and migrates cleanly, and the catalog is seeded with demo data

## Source Feature

- `id`: `bootstrap-database-schema`
- `area`: `bootstrap`
- `depends_on`: `bootstrap-app-skeleton` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

> **Follow-up (2026-10-19):** a generated migration (`0001_needy_malice.sql`) adds the
> `size_chart` table, and `shipping_method` is now seeded with standard/express rows after the
> shipping-cost decision. The original acceptance and evidence below remain historical; see
> `docs/specs/catalog-size-chart-and-shipping.md` for the new content and verification.

## Goal

Give the application a real PostgreSQL data layer: the full catalog/cart/order/account schema from `docs/domain-model.md`, defined in a typed data-access layer, migratable from empty to complete and idempotent on re-run. The schema decision (Drizzle vs Prisma vs raw SQL) is made here and recorded as an ADR.

The feature also ships an **example-data seed** (user decision, 2026-10-11): categories, products and variants (size, color, stock, price) in English and USD that the UI can display, including published, draft and archived products so `catalog-product-listing` can verify visibility rules against real data. The seed must be idempotent and non-destructive, and a test/script must verify the catalog is populated afterwards.

## Non-Goals

- No storefront or backoffice UI. The catalog page is `catalog-product-listing`; nothing in this feature renders product data to a shopper.
- No cart, checkout, order, account or auth behavior — only the tables they will need.
- No AI-side tables (`conversation`, `message`, `try_on_session`, `photo`) and no `collection` table. They are not in the feature's catalog/cart/order/account scope; photo retention rules (blocking question #3) are undecided. Deferred to `chat-assistant` / `virtual-tryon-*`.
- No sales-tax rate table and no seeded shipping methods. Shipping cost rules (blocking question #5) are undecided; `checkout-shipping-method` / `checkout-sales-tax` own them. The `shipping_method` **table** exists in the schema; its rows come later.
- No managed-database provisioning (Neon vs Supabase choice) and no Vercel deployment config. The app connects through `DATABASE_URL` regardless of provider.
- No real payment, email or object-storage integration.
- No persistent browser E2E harness.

## Job Story

When I start implementing catalog and checkout features against this repository,
I want the complete catalog/cart/order/account schema migrated into a real PostgreSQL database and a known-good demo catalog seeded through the chosen data-access layer,
so every later feature is written against a settled data model and representative data instead of re-deciding tables and inventing fixtures.

## Users And Permissions

- No actors or roles in this slice. Everything here is developer-facing infrastructure. Accounts and the `admin` role are modeled as tables but no access behavior is implemented (that is `account-signin-signout` / `admin-role-gate`).

## Acceptance Scenarios

### Scenario 1: Migrations run against an empty database

Given an empty PostgreSQL database and `DATABASE_URL` pointing at it
When the migrate command runs
Then it exits `0` and the core tables exist: `category`, `product`, `product_image`, `variant`, `cart`, `cart_line`, `account`, `address`, `shipping_method`, `order`, `order_line`, `payment`

### Scenario 2: Migrations are idempotent

Given a database that has already been migrated
When the migrate command runs again
Then it exits `0` and changes nothing (applied migrations are tracked and skipped)

### Scenario 3: Smoke read and write through the data-access layer

Given a migrated database
When the data-access layer inserts one row into a core table and reads it back
Then the inserted row is returned with the persisted values

### Scenario 4: Seed populates the catalog

Given a migrated database with an empty catalog
When the seed runs
Then categories, products and variants exist with size, color, stock and price; the products include published, draft and archived statuses; at least one variant has zero stock and at least one variant has a price overriding the product base price

### Scenario 5: Seed is idempotent and non-destructive

Given a database that has already been seeded and one seeded row modified afterwards
When the seed runs again
Then no rows are duplicated, row counts are unchanged, and the modified row still holds its modified value (the seed never updates or deletes existing rows)

### Scenario 6: Catalog population is verified

Given a migrated, seeded database
When the verification script (and its test) runs
Then it confirms the catalog is populated (expected category/product/variant counts and the three product statuses) and exits `0`; on an empty catalog it fails

### Scenario 7: Standard gate stays green, non-blocking and self-contained

Given `./init.sh` is run on a machine with no Docker, no system PostgreSQL and no configured database
When the script runs
Then it exits `0` with lint, typecheck and all tests passing (DB integration tests included), starts no dev server, and leaves no PostgreSQL process behind

## Repository Research

### Files Inspected

- `feature_list.json` — source feature metadata; the six "Provisional" verification lines this spec makes concrete; seed scope folded in by user decision (2026-10-11).
- `AGENTS.md` — startup workflow and command table; `init.sh` contract (non-blocking, never starts a dev server); toolchain pin.
- `PROGRESS.md` — verified state; `bootstrap-app-skeleton` accepted; the "durable findings" (`@types/node ^24`, Vitest `globals: true`) that must not regress.
- `docs/domain-model.md` — entities, relationships, and lifecycle states (product `draft→published→archived`, variant availability, cart/payment/order states) this schema must encode.
- `docs/technical-discovery.md` — stack decision (Next.js App Router + TypeScript + PostgreSQL, Vercel + managed Postgres); table inventory; ORM explicitly left open.
- `docs/risks-and-open-questions.md` — "ORM / data-access layer choice" is an implementation-time question **this feature must resolve**; shipping/tax questions block seeding those tables.
- `docs/user-and-access-model.md` — roles are attributes of the account (no separate admin table); password optional; guest carts unowned.
- `CONTEXT.md` — glossary: variant = size × color, stock is per variant, English naming rules.
- `docs/specs/bootstrap-app-skeleton.md`, `docs/adr/0001-standalone-git-repository.md` — spec/ADR format conventions.
- `ARCHITECTURE.md` — layering intent ("storage goes through the data-access layer chosen in `bootstrap-database-schema`"), standard gate contract, verification stack.
- `init.sh`, `package.json`, `vitest.config.mts`, `.nvmrc`, `app/` — current gate (install + lint + typecheck + test), Vitest 5 with jsdom + `globals: true`, scripts surface, app shell.
- Environment probe (this machine, 2026-10-11): `docker`, `psql`, system PostgreSQL — **all absent**. npm registry reachable through the pinned Node `v24.21.0` (nvm). Verified current versions: `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg` 8.23.1, `embedded-postgres` (17.x line `17.10.0-beta.17`), `@neondatabase/serverless` 1.2.0.

### Existing Patterns To Follow

- Documentation and UI copy in **English**; USD money; US market (`DESIGN.md`, `AGENTS.md`).
- `init.sh` contract: executes non-blocking checks (`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`), never starts long-running processes, may print manual follow-ups.
- Vitest must keep `globals: true` and `@types/node` must stay `^24` (PROGRESS.md durable findings).
- ADRs live in `docs/adr/NNNN-title.md` with Status / Context / Decision / Consequences.
- Durable architectural boundaries land in `ARCHITECTURE.md`; the ORM choice is explicitly tracked as undecided there.

### Current Gaps

- No database tooling at all: no ORM, no migrations, no connection config, no `.env` convention, no seed.
- No way for tests to obtain a database. This machine has **no Docker and no PostgreSQL** (verified), so tests cannot depend on either being installed.
- `init.sh` must remain green and self-contained; it cannot be changed to require an external service.
- No persistent E2E command exists (`pnpm test:e2e` absent).
- No image assets exist for products (`public/` has none); the seed needs displayable imagery.

## Technical Approach

### 1. Data-access decision: Drizzle ORM + drizzle-kit (record as ADR 0002)

**Decision: Drizzle ORM (`drizzle-orm` + `drizzle-kit` over `pg`).** Reasons:

- TypeScript-first schema in plain TS with fully inferred query types and **no generated client or codegen step**. Prisma requires `prisma generate` and ships a query-engine binary — extra build surface and a heavier serverless footprint on Vercel for no benefit at this size.
- SQL-shaped and transparent: `drizzle-kit generate` emits reviewable SQL migrations; applied migrations are tracked (`__drizzle_migrations`) so `migrate` is naturally idempotent — directly serving acceptance scenarios 1–2.
- Expresses the PostgreSQL features this domain needs: enums, CHECK constraints, partial/unique indexes (lifecycle states, `stock >= 0`, `unique (product_id, size, color)`).
- Runs unchanged against `pg` (node-postgres) in dev/tests and a Neon serverless driver in deployment — matches `ARCHITECTURE.md`'s port/adapter layering and keeps the provider swappable behind `DATABASE_URL`.
- Raw SQL is rejected: it hand-rolls migration tracking and type safety for every later query. Prisma is rejected for toolchain weight and codegen ceremony; revisit only if the team later wants Prisma's admin tooling.

The implementer records this in `docs/adr/0002-drizzle-data-access-layer.md` (Status: accepted, referencing this spec) and flips "ORM is undecided" in `ARCHITECTURE.md` and `docs/technical-discovery.md`.

### 2. Schema (catalog/cart/order/account only)

All money is `bigint` **integer cents**, `currency char(3) not null default 'USD'`; catalog prices are tax-exclusive (US market, `DESIGN.md`). Timestamps `timestamptz`. IDs: `uuid` with `gen_random_uuid()`.

- `category` — `slug` unique, `name`, `sort_order`.
- `product` — `slug` unique, `name`, `description`, `composition`, `care`, `base_price_cents`, `currency`, `category_id` FK, `status` enum `('draft','published','archived')`, timestamps.
- `product_image` — `product_id` FK, `path`, `alt_text`, `position` (gallery; listing shows position 1).
- `variant` — `product_id` FK, `size` enum `('XS','S','M','L','XL')`, `color` (English name), `color_hex` (swatch), `sku` unique nullable, `price_override_cents` nullable, `stock_qty int not null default 0 CHECK (stock_qty >= 0)`, `discontinued boolean not null default false`, `unique (product_id, size, color)`. Availability (`available` / `out_of_stock` / `discontinued`) is **derived**: `discontinued OR stock_qty = 0 OR stock_qty > 0`.
- `cart` — `session_token` unique (guest session cookie), `account_id` FK nullable (guest carts unowned), `status` enum `('active','converted','expired')`, timestamps.
- `cart_line` — `cart_id` FK, `variant_id` FK, `quantity int CHECK (quantity > 0)`, `unique (cart_id, variant_id)`.
- `account` — `email` unique (stored lowercase), `password_hash` nullable (Quick Access), timestamps. Roles as attributes via `account_role` table (`account_id` FK, `role` enum `('customer','admin')`, `unique (account_id, role)`) per `docs/user-and-access-model.md`.
- `address` — `account_id` FK nullable, `line1`, `line2`, `city`, `state char(2)`, `zip`, `country char(2) default 'US'`, `phone`.
- `shipping_method` — `slug` unique, `name`, `description`, `cost_cents`, `delivery_estimate`. **Table only, no seed rows** (rules undecided).
- `order` — `reference` unique (human-readable, e.g. `JA-…`), `account_id` FK, `contact_email`, `status` enum `('created','paid','failed','cancelled')`, `fulfillment_status` enum `('preparing','shipped','delivered')` nullable, `address_id` FK, `shipping_method_id` FK, frozen totals `subtotal_cents` / `shipping_cents` / `tax_cents` / `total_cents`, `currency`, `created_at`, `paid_at`.
- `order_line` — `order_id` FK, `variant_id` FK (nullable, keep the snapshot authoritative), frozen snapshot columns `product_name`, `variant_size`, `variant_color`, `unit_price_cents`, `quantity`, `line_total_cents`.
- `payment` — `order_id` FK, `status` enum `('pending','succeeded','failed','cancelled')`, `provider text default 'simulated'`, `amount_cents`, timestamps. One row per attempt now; retry semantics come with `payment-provider-abstraction`.

Schema lives in `db/schema/` as Drizzle table definitions; migration SQL is generated once and committed. Rule: never edit an applied migration — generate a new one.

### 3. How local development and tests get a database

- **Tests (automated gate):** DB integration tests run against an **ephemeral embedded PostgreSQL** started per test run by the `embedded-postgres` package (real PostgreSQL 17 binaries, self-contained — no Docker, no system Postgres; verified absent on this machine). A Vitest `globalSetup` boots it on a free port, creates the test database and sets `DATABASE_URL`; teardown stops it. Nothing is left running. This keeps `./init.sh` self-contained and restartable anywhere.
- **Local development:** whatever real PostgreSQL the developer points `DATABASE_URL` at (Docker, system install, or a managed dev branch). `.env.example` (committed) documents `DATABASE_URL`; `.env.local` stays gitignored.
- **Deployed environments:** managed PostgreSQL (Neon or Supabase) behind the same `DATABASE_URL`; provisioning is out of scope.

Vitest moves to two projects in `vitest.config.mts`: the existing jsdom UI project (keep `globals: true`) and a `node` environment `db` project covering `db/**/*.test.ts`. `pnpm test` runs both.

### 4. Seed (idempotent, non-destructive)

`db/seed.ts` + `db/seed-data.ts`, run via `pnpm db:seed` through the Drizzle schema. Semantics: **insert-if-missing only** (`ON CONFLICT DO NOTHING` on natural keys: `product.slug`, `category.slug`, `unique (product_id, size, color)` for variants). Never updates, never deletes, runs in one transaction. Re-running after user edits leaves those edits untouched.

Seed inventory (validator-checkable):

- **6 categories**: Coats, Blazers, Dresses, Knitwear, Shirts, Trousers (glossary examples).
- **9 products** (English names, USD tax-exclusive prices $89–$349 as cents, description, composition, care): **6 published** (one per category), **2 draft**, **1 archived** — this covers `catalog-product-listing`'s visibility verification.
- **Variants**: every product has ≥ 3 variants (sizes XS–XL × 1–2 English colors with `color_hex` swatches); total ≥ 24. At least **one published product carries a `stock_qty = 0` variant** (out-of-stock UI for `product-variant-selection`) and at least **one variant with `price_override_cents` ≠ base price** (price-driven selection).
- **Images**: each product ≥ 1 image, ≥ 2 published products have ≥ 3 (gallery for `product-detail-page`). Paths reference `/images/products/<slug>-<n>.svg`; the feature commits lightweight 3:4 placeholder SVGs under `public/images/products/` so the listing can actually render something. Real imagery/object storage is later.

### 5. Scripts and the `init.sh` contract

New `package.json` scripts: `db:generate` (drizzle-kit generate), `db:migrate` (drizzle-kit migrate against `DATABASE_URL`), `db:seed`, `db:verify` (asserts catalog populated; exit 1 on empty). TypeScript scripts run with **Node 24 native type stripping** (erasable syntax only — no TS `enum`/`namespace`; use Drizzle `pgEnum` + string unions; explicit `.ts` extensions in `db/` imports). If that proves obstructive for the drizzle config, add `tsx` as a devDependency and note it in `ARCHITECTURE.md`.

`init.sh` keeps its exact contract: install + lint + typecheck + test (DB tests included via embedded Postgres), never starts long-running processes, may print `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:verify` as manual follow-ups. It must **not** run migrations or the seed itself and must **not** require a configured database.

## Expected File Changes

- `db/schema/*.ts` — create; Drizzle table + enum definitions for all tables above.
- `drizzle.config.ts` — create; drizzle-kit config reading `DATABASE_URL`.
- `db/migrations/*.sql` — create (generated once, committed); initial full-schema migration.
- `db/client.ts` — create; connection factory (`getDb()`) from `DATABASE_URL`.
- `db/catalog.ts` — create; thin repository module (insert + read) used by the smoke test and later by `catalog-product-listing`.
- `db/seed-data.ts`, `db/seed.ts` — create; declarative seed content and idempotent loader.
- `db/verify.ts` — create; catalog-population check (counts + the three statuses).
- `db/tests/migrate.test.ts`, `db/tests/seed.test.ts`, `db/tests/smoke.test.ts` — create; scenarios 1–6.
- `db/tests/global-setup.ts` (name flexible) — create; boot/stop embedded Postgres for the `db` Vitest project.
- `vitest.config.mts` — modify; add the node-environment `db` project + globalSetup; keep jsdom UI project and `globals: true`.
- `package.json` / `pnpm-lock.yaml` — modify; scripts `db:generate|db:migrate|db:seed|db:verify`; deps `drizzle-orm`, `pg`; devDeps `drizzle-kit`, `embedded-postgres` (17.x line), `@types/pg`.
- `.env.example` — create; `DATABASE_URL` placeholder + comment.
- `.gitignore` — verify `.env*` is ignored (add if not).
- `public/images/products/*.svg` — create; placeholder seed images.
- `docs/adr/0002-drizzle-data-access-layer.md` — create; the ORM decision above.
- `init.sh` — modify; add manual follow-up lines for `db:*` commands (contract unchanged).
- `AGENTS.md` — modify; add `db:*` commands and env setup to the command table.
- `ARCHITECTURE.md` — modify; data layer section (Drizzle decision, schema layout, money-as-cents), test-database strategy, verification stack row for DB integration tests.
- `CONSTRAINTS.md` — create (see below).
- `PROGRESS.md`, `feature_list.json` — modify at end of session; evidence and verified state.

## Visual Design Impact

- UI involved: **no**. Nothing renders product data; `/` stays the static landing page and must remain buildable without a database.
- Design source: not applicable. The only visual artifacts are neutral placeholder SVGs for seed images (plain 3:4 blocks; no new visual language — keep `DESIGN.md` conventions if any styling is added).
- Screens or states affected: none.
- New design artifact required: **no**.

## Durable Documentation Impact

- `ARCHITECTURE.md`: **update** — this feature realizes the "storage goes through the data-access layer" boundary: Drizzle decision, `db/` layout, money-as-cents, embedded-Postgres test strategy, new verification-stack row. Also remove "ORM is undecided" from Known Open Points.
- `CONSTRAINTS.md`: **create** — durable MUST rules introduced here: (1) money is integer cents, USD, tax-exclusive; (2) schema changes go through new migrations, never by editing applied ones; (3) seed scripts stay insert-if-missing (idempotent, never update/delete); (4) the automated test suite must stay self-contained (no Docker/system-Postgres dependency; DB tests use the embedded server).
- `AGENTS.md`: **update** — the command surface grows (`db:*`, env setup), which is startup-path information for future sessions.
- Other docs: `docs/technical-discovery.md` — update the "To be decided (e.g. Drizzle or Prisma)" table row to Drizzle; `docs/risks-and-open-questions.md` — move "ORM / data-access layer choice" from *Implementation-Time Questions* to resolved (point at the ADR). `PROGRESS.md` and `feature_list.json` updated at end of session per the Definition Of Done.

## Implementation Plan

1. Add dependencies (`drizzle-orm`, `pg`, `drizzle-kit`, `embedded-postgres`, `@types/pg`) and the `db:*` scripts.
2. Define the Drizzle schema in `db/schema/` and generate the initial migration; write `docs/adr/0002-drizzle-data-access-layer.md`.
3. Stand up the test harness (embedded Postgres globalSetup) and write the migration tests (scenarios 1–2) plus the smoke read/write test (scenario 3) against `db/catalog.ts`.
4. Write the seed data and loader; add seed + verify tests (scenarios 4–6), including the modified-row non-destructive check.
5. Add placeholder seed images, `.env.example`, and the `init.sh` / `AGENTS.md` / `ARCHITECTURE.md` / `CONSTRAINTS.md` / discovery-doc updates.
6. Run the full verification plan against both the embedded test DB and (manually) a real `DATABASE_URL`; capture evidence; update `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Add deps and `db:generate`, `db:migrate`, `db:seed`, `db:verify` scripts.
- [ ] Define Drizzle schema for all 13 tables with enums, FKs, CHECKs and unique constraints.
- [ ] Generate and commit the initial migration; confirm empty→migrated and re-run idempotency.
- [ ] Write `docs/adr/0002-drizzle-data-access-layer.md` and resolve the ORM line in `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `ARCHITECTURE.md`.
- [ ] Build the embedded-Postgres Vitest globalSetup and the node-environment `db` test project (keep `globals: true`).
- [ ] Write `db/client.ts` and `db/catalog.ts`; add the smoke insert/read test.
- [ ] Write `db/seed-data.ts` and `db/seed.ts` (insert-if-missing, single transaction) per the seed inventory.
- [ ] Write `db/verify.ts` and its test (populated passes, empty fails).
- [ ] Add seed tests for idempotency and non-destructiveness (counts stable; modified row untouched).
- [ ] Commit placeholder SVGs under `public/images/products/` matching seed image paths.
- [ ] Add `.env.example`; confirm `.env*` is gitignored.
- [ ] Update `init.sh` (manual follow-ups only), `AGENTS.md`, `ARCHITECTURE.md`; create `CONSTRAINTS.md`.
- [ ] Run the verification plan; capture evidence; update `feature_list.json` (replace the provisional verification strings with concrete commands) and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — **expected:** exits `0`; install + lint + typecheck + `pnpm test` all green **including the DB integration tests**, with no database configured and no Docker present. Leaves no dev server and no PostgreSQL process behind (check with `pgrep -f postgres` after the run).
- `./init.sh` a second time — **expected:** exits `0` again (idempotent).
- `pnpm test` — **expected:** DB tests pass; test names recorded (migrate-once, migrate-idempotent, smoke read/write, seed-populates, seed-idempotent-non-destructive, verify-populated).
- Manual against a real database (`DATABASE_URL`): `pnpm db:migrate` on empty DB → exit 0; `pnpm db:migrate` again → exit 0, no-op; `pnpm db:seed` → exit 0; `pnpm db:seed` again → exit 0 and identical row counts; `pnpm db:verify` → exit 0 printing category/product/variant counts and status breakdown; `pnpm db:verify` against an unseeded DB → non-zero exit.
- `pnpm build` — **expected:** exits `0`; the build must not require a database (`/` stays static).
- **E2E: not appropriate.** No persistent E2E command exists, and this feature has no user-visible flow, routing, auth or API surface — it is schema, seed and data-access only. The first features with real user flows (`catalog-product-listing` onward) introduce the E2E harness, and their specs reference this seed as fixture data.

## Evidence To Capture

- `./init.sh` output (two runs) with exit codes and the DB test names from `pnpm test`.
- Test-name list for the six DB tests (scenarios 1–6).
- Manual `db:migrate` / `db:seed` (twice) / `db:verify` transcript against a real database, including the row-count comparison proving idempotent non-destructive seeding.
- Confirmation that no PostgreSQL or dev-server process is left after `./init.sh`.
- Record all of the above in `feature_list.json` → `bootstrap-database-schema.evidence` and summarize in `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no UI, no cart/checkout/auth behavior, no AI tables, no seeded shipping methods, no managed-DB provisioning).
- [ ] Acceptance scenarios 1–7 pass, each backed by a named test or command.
- [ ] Verification evidence is present and recorded in `feature_list.json` / `PROGRESS.md`.
- [ ] Persistent E2E coverage was explicitly not added; the spec's justification is valid.
- [ ] Seed inventory matches the spec exactly (6 categories; 9 products: 6 published / 2 draft / 1 archived; ≥ 24 variants incl. a zero-stock variant and a price-override variant; English copy; USD cents prices; images resolve).
- [ ] Seed re-run neither duplicates rows nor overwrites modified rows.
- [ ] `./init.sh` contract intact: non-blocking, self-contained (works with no Docker/Postgres installed), never starts long-running processes.
- [ ] `docs/adr/0002-drizzle-data-access-layer.md` exists and the ORM decision is consistently recorded in `ARCHITECTURE.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`.
- [ ] `feature_list.json` and `PROGRESS.md` updated correctly; provisional verification strings made concrete.
- [ ] No unrelated product behavior or extra feature work was added.

## Unknowns / Flags

1. **`embedded-postgres` versioning** is `<postgres-version>-beta.<wrapper>` (17.x line: `17.10.0-beta.17`). Pin the 17.x line. If the binaries fail to install or boot on the target machine, the fallback is a developer-provided test `DATABASE_URL` — but that would weaken the self-contained gate, so treat a failure here as a blocker to surface, not something to paper over.
2. **Node 24 native type stripping** for `db:*` scripts requires erasable syntax and explicit `.ts` import extensions (possible `allowImportingTsExtensions` in `tsconfig.json`). Fallback: `tsx` devDependency. The implementer picks one path and records it in `ARCHITECTURE.md`.
3. **Placeholder SVG product images** are a stopgap so the listing can render; real imagery and object storage remain open ("Object storage provider" is still an implementation-time question). If the implementer prefers simple raster placeholders, that is acceptable — only the paths in `db/seed-data.ts` are contract.
4. **Managed provider (Neon vs Supabase)** remains undecided; irrelevant here since everything connects via `DATABASE_URL`. Do not decide it in this feature.
5. Tax-rate storage is intentionally absent; `checkout-sales-tax` must not assume this schema already covers it.
