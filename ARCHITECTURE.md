# Architecture

Runtime and tooling boundaries for **J. Armando**. Update this file when domains, layers, runtime surfaces, dependency direction, adapters/providers or other architectural boundaries change.

## Status

The application shell and the PostgreSQL data layer exist, and the catalog storefront renders published products. The `/catalog` listing is a dynamic Server Component whose filter and sort state lives entirely in URL query params (shareable, back/forward-friendly); cart, checkout, orders, identity and AI are not implemented yet. See `feature_list.json` for what is planned and `docs/technical-discovery.md` for the technology decisions.

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
- **Rendering:** `/` prerenders as static content. DB-backed routes (`/catalog`, `/products/[slug]`) are `force-dynamic` and render on demand. Next 16 `searchParams` is a `Promise<Record<string, string | string[] | undefined>>` that a page `await`s.
- **Route surface (public, read-only):**
  - `/` — landing page.
  - `/catalog` — published product grid (dynamic; `catalog-product-listing`) with URL-driven filter/sort state (`catalog-filtering`).
  - `/products/[slug]` — published product detail by public slug (dynamic; `product-detail-page`). Draft, archived and unknown slugs call `notFound()` (HTTP 404).
- **Catalog listing state:** filter/sort state (category, size, color, max price, sort) lives only in the URL query string — no client store. The page parses it (`app/catalog/filter-params.ts`), fetches through the repository, and a client toolbar pushes new `/catalog?...` history entries via `next/navigation`'s `useRouter`. Reset navigates to the bare `/catalog`.
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
  layout.tsx             Root layout: html/body, global fonts, metadata
  page.tsx               Landing page (placeholder shell)
  globals.css            Design tokens and base styles
  page.test.tsx          Landing page smoke test
  catalog/               Catalog grid route (/catalog)
  products/[slug]/       Product detail route (/products/[slug]) + not-found state
db/                      Data layer: Drizzle schema, migrations, seed, scripts
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

- **Schema:** `db/schema/` — Drizzle tables and PostgreSQL enums grouped by domain (`catalog.ts`, `account.ts`, `cart.ts`, `order.ts`). Scope today: catalog/cart/order/account. AI-side tables (conversation, message, try_on_session, photo), collections, tax rates and shipping-method rows belong to later features.
- **Conventions:** money is `bigint` **integer cents** with `currency char(3) default 'USD'` and catalog prices tax-exclusive (US market); timestamps are `timestamptz`; ids are `uuid` with `gen_random_uuid()`. Variant availability (`available` / `out_of_stock` / `discontinued`) is derived, never stored.
- **Migrations:** `pnpm db:generate` writes SQL to `db/migrations/` once; the output is committed. Applied migrations are tracked (`drizzle.__drizzle_migrations`), so `pnpm db:migrate` is idempotent. Never edit an applied migration — generate a new one (`CONSTRAINTS.md`).
- **Seed:** `pnpm db:seed` loads `db/seed-data.ts` (demo catalog: 6 categories, 9 products across published/draft/archived, 40 variants, 16 images) with strict insert-if-missing semantics — `ON CONFLICT DO NOTHING` on natural keys in one transaction; never updates, never deletes. `pnpm db:verify` asserts the catalog is populated and exits non-zero on an empty catalog.
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

Not yet realised in code, but this is the direction to preserve:

- **UI (App Router routes)** → calls application services → **domain** → **ports** (interfaces) → **adapters** (real implementations).
- External capabilities sit behind ports so they can be swapped or simulated without touching store code. Two are already specified:
  - `PaymentProvider` — simulated in the MVP, real gateway later (`docs/specs/` for `payment-provider-abstraction`).
  - `TryOnProvider` and `ChatAssistant` — real external services behind their own interfaces.
- Catalog, cart and order rules belong in the domain layer, not in React components or route handlers.
- Storage goes through the Drizzle data-access layer in `db/` (ADR 0002); features depend on `db/` repositories, never on raw `pg` access.

## Known Open Points

- **Design token conflict.** `DESIGN.md` records a discrepancy between the design-system front matter (`primary: #000000`) and its prose ("Never pure digital black", `#121212`). The landing page uses the prose values (`#121212` ink, `#F9F8F5` canvas). Unresolved — listed in `DESIGN.md` open design questions.
- **Styling approach is undecided.** Only plain CSS with custom properties is in use. Do not commit the project to a styling system until that decision is made deliberately.
