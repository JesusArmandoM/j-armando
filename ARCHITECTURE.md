# Architecture

Runtime and tooling boundaries for **J. Armando**. Update this file when domains, layers, runtime surfaces, dependency direction, adapters/providers or other architectural boundaries change.

## Status

Pre-product. The application shell exists; no product behavior (catalog, cart, checkout, orders, identity, AI) is implemented yet. See `feature_list.json` for what is planned and `docs/technical-discovery.md` for the technology decisions.

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
- **Rendering:** static for now. `/` prerenders as static content.
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
docs/                    Discovery documents (English) and specs
  specs/                 One implementation spec per feature
stitch_image_based_application/   Design reference only — NOT a specification
init.sh                  Standard startup + verification gate (non-blocking)
feature_list.json        Source of truth for feature state
PROGRESS.md              Verified state and session log
AGENTS.md                Agent operating rules
ARCHITECTURE.md          This file
CONSTRAINTS.md           Durable MUST/MUST NOT rules (does not exist yet)
```

## Standard Gate

`./init.sh` is the single entry point for startup and verification. Contract:

1. It **executes** the non-blocking checks: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
2. It **must not** start long-running processes such as `pnpm dev`.
3. It **may** print manual follow-up commands after the checks pass.
4. It fails fast via `set -euo pipefail`.

Individual commands are also available as `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.

## Verification Stack

| Level | Tool | Command |
| --- | --- | --- |
| Lint | ESLint (`eslint-config-next`) | `pnpm lint` |
| Types | `tsc --noEmit` | `pnpm typecheck` |
| Unit/component | Vitest + Testing Library (jsdom) | `pnpm test` |
| Production build | `next build` | `pnpm build` |
| Browser E2E | **not present** | — |

Vitest runs with `globals: true`. This is required: `@testing-library/react` only registers its automatic `afterEach` cleanup when `afterEach` is globally available. Setting `globals: false` silently leaks DOM between tests.

There is no persistent browser E2E harness yet. Focused E2E coverage becomes required from the first feature with a real user flow (`catalog-product-listing` onward).

## Layering Intent

Not yet realised in code, but this is the direction to preserve:

- **UI (App Router routes)** → calls application services → **domain** → **ports** (interfaces) → **adapters** (real implementations).
- External capabilities sit behind ports so they can be swapped or simulated without touching store code. Two are already specified:
  - `PaymentProvider` — simulated in the MVP, real gateway later (`docs/specs/` for `payment-provider-abstraction`).
  - `TryOnProvider` and `ChatAssistant` — real external services behind their own interfaces.
- Catalog, cart and order rules belong in the domain layer, not in React components or route handlers.
- Storage goes through the data-access layer chosen in `bootstrap-database-schema` (Drizzle vs Prisma vs raw SQL is still undecided; see `docs/risks-and-open-questions.md`).

## Known Open Points

- **Design token conflict.** `DESIGN.md` records a discrepancy between the design-system front matter (`primary: #000000`) and its prose ("Never pure digital black", `#121212`). The landing page uses the prose values (`#121212` ink, `#F9F8F5` canvas). Unresolved — listed in `DESIGN.md` open design questions.
- **Styling approach is undecided.** Only plain CSS with custom properties is in use. Do not commit the project to a styling system until that decision is made deliberately.
- **ORM is undecided.** Deferred to `bootstrap-database-schema`.
