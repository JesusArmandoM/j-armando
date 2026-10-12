# Feature Implementation Spec: Next.js + TypeScript application skeleton runs locally

## Source Feature

- `id`: `bootstrap-app-skeleton`
- `area`: `bootstrap`
- `depends_on`: [] (none)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Give the repository a runnable Next.js (App Router) + TypeScript application shell so that every later feature is implemented against a known-good baseline instead of against nothing. After this feature, `./init.sh` is a real, non-blocking install-and-verify gate rather than a pre-bootstrap status printer, and the app serves a landing page over HTTP.

This is deliberately a shell, not a product slice. It establishes the framework, the project layout, the standard verification path and the minimal styling footing. It must not contain catalog, cart, order, identity or AI behavior.

## Non-Goals

- No database, schema, migrations or ORM. That is `bootstrap-database-schema`.
- No catalog, cart, checkout, order, account or AI behavior.
- No authentication or authorization of any kind.
- No persistent browser E2E harness (e.g. Playwright). Deferred; see Verification Plan.
- No CI/CD pipeline, no Vercel deployment configuration beyond framework defaults.
- No full styling/design-system implementation. Only what a placeholder landing page needs.
- No AI provider wiring, no payment provider wiring.
- No redesign of `stitch_image_based_application/` assets.

## Job Story

When I open a fresh session in a repository that has discovery docs and a feature list but no application code,
I want a runnable Next.js + TypeScript shell with a standard non-blocking verification gate,
so I can implement the first product feature against a baseline that is known to build, lint, typecheck and test cleanly.

## Users And Permissions

- No actors or roles in this slice. The landing page is public and static. Authentication arrives in `account-signin-signout` and `admin-role-gate`.

## Acceptance Scenarios

### Scenario 1: Landing page is served

Given the development server has been started with the documented start command
When an HTTP GET request is made to the root path
Then the response status is `200` and the body contains the store name "J. Armando"

### Scenario 2: Standard gate passes from a clean checkout

Given a clean checkout with no `node_modules`
When `./init.sh` is run
Then dependencies install and lint, typecheck and tests all run and the script exits `0`

### Scenario 3: Gate is re-runnable and non-blocking

Given `./init.sh` has already been run successfully once
When `./init.sh` is run again
Then it completes again with exit code `0` and leaves no long-running process behind

### Scenario 4: Production build succeeds

Given the project has been set up
When the documented build command is run
Then it exits `0` and produces a production build

### Scenario 5: Gate does not start a dev server

Given `./init.sh` is run
When the script finishes
Then no development server process is left running and the script has not blocked waiting on one

## Repository Research

### Files Inspected

- `AGENTS.md` — agent operating rules. Its Startup Workflow step 4 runs `./init.sh`, and its `Required Artifacts` section names `init.sh` as the standard startup and verification path.
- `PROGRESS.md` — records `Standard verification path: not bootstrapped yet` and `Current next ready feature: bootstrap-app-skeleton`.
- `feature_list.json` — source feature metadata, including the provisional verification strings this spec must make concrete.
- `init.sh` — current **pre-bootstrap** variant. Prints document/artifact presence and the placeholders `install`, `verify`, `start` that this feature must replace with real commands.
- `docs/technical-discovery.md` — stack decision: Next.js (App Router) + TypeScript + PostgreSQL, Vercel + managed Postgres. ORM and styling approach are explicitly left as implementation-time questions.
- `DESIGN.md` — visual direction, brand naming (`J. Armando`), English UI copy requirement, zero-radius editorial language.
- `CONTEXT.md`, `docs/build-brief.md`, `docs/mvp-scope.md`, `docs/risks-and-open-questions.md` — product context and the standing non-goals.
- `stitch_image_based_application/` — design reference only (a proposal), not a specification.

### Existing Patterns To Follow

- Documentation and UI copy are in **English**; do not introduce Spanish copy from the design assets.
- `feature_list.json` is the source of truth for feature state; `PROGRESS.md` holds verified state and session log.
- Harness rule already stated in `AGENTS.md`: `./init.sh` is the standard startup and verification path.
- `DESIGN.md` language: zero-radius rectilinear forms, ivory/ink palette, Newsreader + Hanken Grotesk pairing, hairline borders instead of shadows.

### Current Gaps

- No `package.json`, `tsconfig.json`, lint config, test config or application source exist anywhere in the repo. Verified: `find` for `package.json` / `tsconfig.json` / `*.ts` / `*.tsx` outside `.agents/` returns nothing.
- No Node.js version or package manager is pinned. Must be decided and recorded here.
- No test runner exists. Must be introduced with at least one passing test.
- No persistent E2E command exists (`pnpm test:e2e` and equivalents do not exist).
- No CI configuration exists.
- ORM choice and styling approach are undecided upstream; **neither is needed for this slice** and neither should be decided here beyond what the landing page requires.
- The design assets contain no landing/home screen. Composition must be derived from `DESIGN.md` principles.

## Technical Approach

Scaffold a Next.js App Router project with TypeScript at the repository root, keeping the surface minimal.

1. **Pin the toolchain.** Choose and record a package manager and a Node version. Recommended: `pnpm` with a pinned Node LTS via `package.json` `engines` and an `.nvmrc`. Record the choice in `ARCHITECTURE.md`.
2. **Create the Next.js App Router shell.** Root layout and a single landing page route. TypeScript in strict mode. Keep the App Router directory convention (`app/`) so later features add routes predictably.
3. **Add the standard scripts.** `dev`, `build`, `start`, `lint`, `typecheck`, `test`. `typecheck` runs `tsc --noEmit`. `lint` uses the framework's standard linter config.
4. **Introduce a test runner with one smoke test.** Recommended: Vitest with a React testing library, asserting the landing page renders the store name. The point is that `npm test`/`pnpm test` is a real, green gate from day one.
5. **Build the placeholder landing page** to `DESIGN.md` conventions only: English copy, brand "J. Armando", USD, zero-radius, ivory/ink palette. Do not invent a new visual style and do not build catalog UI.
6. **Rewrite `init.sh`** from the pre-bootstrap variant to the bootstrapped variant: install, then run lint + typecheck + test. It must stay non-blocking and must never start a dev server. Keep the document/artifact presence listing, which is useful as a cheap sanity check.
7. **Update `AGENTS.md`** so the startup path reflects real commands instead of the pre-bootstrap note.
8. **Create `ARCHITECTURE.md`** recording the shell, the toolchain pin, the standard gate and the layering intent for later features.

Ordering matters: the verification gate must be green before the landing page is treated as done, so a broken baseline cannot be papered over.

## Expected File Changes

Paths are **provisional**: the application does not exist yet and the exact generator output may vary slightly.

- `package.json` — create; scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `test`), `engines`, dependencies and dev dependencies.
- `pnpm-lock.yaml` (or equivalent lockfile) — create; reproducible installs.
- `.nvmrc` — create; pinned Node LTS.
- `tsconfig.json` — create; TypeScript strict mode.
- `next.config.ts` — create; framework config.
- `app/layout.tsx` — create; root layout, English `lang`, metadata for "J. Armando".
- `app/page.tsx` — create; placeholder landing page.
- `app/globals.css` — create; minimal token-derived styles per `DESIGN.md`.
- `eslint.config.mjs` (or framework default lint config) — create; lint rules.
- `vitest.config.ts` + `app/page.test.tsx` — create; test runner config and one smoke test.
- `init.sh` — modify; replace the three placeholders with real install/verify commands, keep the presence listing, keep the no-dev-server guarantee.
- `AGENTS.md` — modify; update `Startup Workflow` and add the real install/verify/start commands.
- `ARCHITECTURE.md` — create; shell layout, toolchain pin, standard gate, layering intent.
- `PROGRESS.md` — modify at end of session; record verified state and evidence.
- `feature_list.json` — modify at end of session; set status and record evidence for this feature.

## Visual Design Impact

- UI involved: **yes** — a placeholder landing page.
- Design source: `DESIGN.md`.
- Screens or states affected: landing page (new, does not exist in the design assets).
- New design artifact required: **no**, but note the gap: `stitch_image_based_application/` covers catalog, product detail and checkout only. There is no landing/home screen reference. Derive composition strictly from `DESIGN.md` (zero-radius forms, ivory/ink palette, Newsreader for headings, Hanken Grotesk for functional text, generous whitespace). Do not build the catalog grid, the AI badges or the excluded modules (AI Stylist cross-sell, FITIQ, newsletter).

Feature-specific visual states to handle: the landing page needs only a static rendered state. No loading, empty or error states are required for this slice.

## Durable Documentation Impact

- `ARCHITECTURE.md`: **create** — this is the first feature that establishes runtime surfaces (Next.js App Router), the toolchain pin, the layering intent and the standard verification path. Later features will extend these boundaries.
- `CONSTRAINTS.md`: **not needed** — the only durable rule introduced here (the `init.sh` contract: execute non-blocking checks, never start long-running servers) is already stated in `AGENTS.md` and will be stated in `init.sh`'s header comment. Creating a second source would duplicate it.
- `AGENTS.md`: **update** — the startup path changes from "pre-bootstrap, nothing to verify" to a real install/verify gate with concrete commands. This is exactly the case the rule covers.
- Other docs: `PROGRESS.md` and `feature_list.json` — update at end of session with verified state and evidence, per the harness Definition Of Done.

## Implementation Plan

1. Pin the toolchain (package manager + Node version) and record the choice.
2. Scaffold the Next.js App Router + TypeScript shell at the repository root.
3. Add the standard scripts and the test runner with one smoke test; confirm lint, typecheck and test all pass on the empty shell.
4. Build the placeholder landing page to `DESIGN.md` conventions and confirm the smoke test covers it.
5. Rewrite `init.sh` to the bootstrapped variant and confirm it runs green without starting a dev server.
6. Update `AGENTS.md` with the real commands and create `ARCHITECTURE.md`.
7. Run the full verification plan, capture evidence, then update `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Choose and pin the package manager and Node version (`.nvmrc`, `package.json` `engines`).
- [ ] Scaffold the Next.js App Router project with strict TypeScript at the repo root.
- [ ] Add `dev`, `build`, `start`, `lint`, `typecheck`, `test` scripts.
- [ ] Add the test runner config and one smoke test asserting the landing page renders "J. Armando".
- [ ] Confirm `lint`, `typecheck` and `test` pass on the empty shell before adding UI.
- [ ] Implement the placeholder landing page following `DESIGN.md` (English copy, USD, zero-radius, ivory/ink).
- [ ] Rewrite `init.sh` to run install + lint + typecheck + test, non-blocking, never starting a dev server.
- [ ] Update `AGENTS.md` startup workflow and command list.
- [ ] Create `ARCHITECTURE.md` with shell layout, toolchain pin, standard gate and layering intent.
- [ ] Run the verification plan and capture evidence.
- [ ] Update `feature_list.json` (status + evidence) and `PROGRESS.md` (verified state + session log entry).

## Verification Plan

- `./init.sh` — **expected:** exits `0`; installs dependencies; runs lint, typecheck and tests, all passing. Must not start a dev server and must not block.
- `./init.sh` run a second time — **expected:** exits `0` again (re-runnable, idempotent).
- `<build command>` (e.g. `pnpm build`) — **expected:** exits `0` and produces a production build.
- `<dev command>` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` — **expected:** `200`, and the body contains `J. Armando`. This is a **manual** check; it is not part of `init.sh`.
- `<test command>` — **expected:** the landing-page smoke test passes and its name is recorded.

For `init.sh` explicitly:

- `./init.sh` executes the non-blocking standard gate for the current repo state (install + lint + typecheck + test).
- `./init.sh` must **not** start long-running processes such as `pnpm dev`. The dev-server check is a manual step in this plan.
- `./init.sh` may print manual follow-up commands (dev server, build) after the non-blocking checks pass.

**E2E coverage: not appropriate for this slice.** No persistent E2E command exists in the repo today, and this feature introduces no user-visible product flow, routing change, authentication or API surface beyond a single static landing page. Introducing a browser E2E harness is its own bootstrap decision and is explicitly a non-goal here. Focused E2E coverage becomes required from the first feature with a real user flow (`catalog-product-listing` onward), at which point an E2E harness should be introduced.

## Evidence To Capture

- Full output of `./init.sh` showing install + lint + typecheck + test all passing and exit code `0`.
- Output of the build command showing a successful production build.
- The `curl` HTTP status line showing `200` and the landing-page body containing `J. Armando`.
- The passing smoke test's name and count from the test runner output.
- Confirmation that no process is left running after `./init.sh` completes.

Record these in `feature_list.json` under `evidence` for `bootstrap-app-skeleton` and summarize in `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no database, no catalog, no auth, no AI, no payment).
- [ ] Acceptance scenarios pass (landing page served, gate passes from clean checkout, gate re-runnable, build succeeds, gate does not start a dev server).
- [ ] Verification evidence is present and recorded.
- [ ] Persistent E2E coverage was explicitly not added, and the spec's justification for that is valid.
- [ ] `feature_list.json` and `PROGRESS.md` were updated correctly.
- [ ] No unrelated product behavior or extra feature work was added.
- [ ] `init.sh` is still executable and still does not start long-running servers.
- [ ] UI copy is English and prices/currency references are USD, per `DESIGN.md`.
- [ ] `ARCHITECTURE.md` and `AGENTS.md` were updated as specified; `CONSTRAINTS.md` was deliberately not created.

## Unknowns

These are explicit and do not block this slice, but the implementer must make and record the first one:

1. **Package manager and Node version are not pinned anywhere.** The implementer must choose (recommended: `pnpm` + Node LTS) and record it in `ARCHITECTURE.md`. This is the only decision this spec delegates.
2. **Styling approach is undecided** upstream in `docs/technical-discovery.md`. This slice needs only enough styling for a placeholder page; do not commit the project to a styling system here.
3. **Landing page composition has no design reference.** Derive it from `DESIGN.md` principles and keep it deliberately minimal.
