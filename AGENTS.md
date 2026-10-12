# Project Agent Instructions

This repository contains **J. Armando**, a production-grade clothing e-commerce storefront (US market, USD) with a simulated payment provider, a guest-first checkout that creates the account at payment time, an admin backoffice, a chat assistant and a virtual try-on.

## Read First

- `CONTEXT.md` — domain language (glossary and rejected terms).
- `CONSTRAINTS.md` — durable MUST / MUST NOT rules (money as integer cents, migrations, seeds, test self-containment).
- `docs/build-brief.md` — problem, users, goals, non-goals, MVP slice, validation.
- `docs/domain-model.md` — core entities, relationships, states and lifecycles.
- `docs/risks-and-open-questions.md` — current risks and unresolved questions.
- `DESIGN.md` — visual direction and how to use the design assets.

Read optional docs only when relevant:

- `docs/user-and-access-model.md` — when touching users, roles, permissions, access, or photo privacy.
- `docs/technical-discovery.md` — when touching stack, integrations, deployment, auth, payments, AI providers, email, storage or operations.
- `docs/mvp-scope.md` — when selecting or slicing MVP work.
- `docs/adr/` — when a decision might contradict existing accepted decisions.

## Commands

| Purpose | Command |
| --- | --- |
| Start a session | `./init.sh` |
| Install dependencies | `pnpm install` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Tests | `pnpm test` |
| Production build | `pnpm build` |
| Dev server (long-running; run manually) | `pnpm dev` |
| Generate a DB migration from `db/schema/` | `pnpm db:generate` |
| Apply DB migrations (needs `DATABASE_URL`) | `pnpm db:migrate` |
| Seed the demo catalog (needs `DATABASE_URL`) | `pnpm db:seed` |
| Verify the catalog is populated (needs `DATABASE_URL`) | `pnpm db:verify` |
| Boot a disposable local PostgreSQL 17 | `pnpm db:devdb` (prints `DATABASE_URL`; Ctrl-C stops it) |

`./init.sh` runs install + lint + typecheck + test and exits. It never starts a dev server and never touches a database.

Database access goes through `DATABASE_URL` (Drizzle over `pg`; see `ARCHITECTURE.md` → Data Layer). Copy `.env.example` to `.env.local` (gitignored) or export the variable before running the `db:migrate` / `db:seed` / `db:verify` commands; each command loads `.env.local`/`.env` itself, and an exported `DATABASE_URL` wins over file contents (env-file precedence: `ARCHITECTURE.md` → Data Layer). The test suite needs no configuration: it boots an ephemeral embedded PostgreSQL 17 per run and leaves nothing behind.

Toolchain: Node `v24.21.0` via nvm (`~/.nvm`, pinned by `.nvmrc`), pnpm `12.11.2` via Corepack. `init.sh` loads nvm if the shell has not. See `ARCHITECTURE.md`.

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `PROGRESS.md` for current verified state and next step.
3. Read `feature_list.json` and pick the first ready unfinished feature in list order.
4. Run `./init.sh`.
5. If baseline verification fails, fix the baseline before adding new feature work.

## Working Rules

- Work on one feature at a time.
- Do not mark a feature complete just because code was added.
- Keep changes inside the selected feature scope unless a blocker requires a narrow supporting fix.
- Do not silently change verification rules during implementation.
- Update durable repo artifacts instead of relying on chat summaries.
- Keep UI copy in English (US market); keep documentation in English.
- Treat `stitch_image_based_application/` as **design reference only**. It is a proposal that may be redesigned; do not treat its Spanish copy, EUR pricing or IVA-inclusive totals as specification. See `DESIGN.md`.
- Do not build what `docs/mvp-scope.md` excludes (AI Stylist cross-sell, fit prediction, newsletter, returns, order tracking portal, real payment gateway).

## Required Artifacts

- `feature_list.json`: source of truth for feature state.
- `PROGRESS.md`: current verified state and lightweight session log.
- `init.sh`: standard startup and verification path.

## Definition Of Done

A feature is done only when all are true:

- target behavior is implemented,
- required verification actually ran,
- evidence is recorded in `feature_list.json` or `PROGRESS.md`,
- repository remains restartable from the standard startup path,
- relevant docs are updated if product behavior, domain rules, API, or verification changed.

## End Of Session

Before ending a session:

1. Update `PROGRESS.md`.
2. Update `feature_list.json`.
3. Record unresolved risks or blockers.
4. Leave the repo clean enough for the next session to run `./init.sh` immediately.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
