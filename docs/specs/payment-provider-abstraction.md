# Feature Implementation Spec: PaymentProvider interface with a simulated implementation

## Source Feature

- `id`: `payment-provider-abstraction`
- `area`: `payments`
- `depends_on`: `["bootstrap-app-skeleton"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Establish the `PaymentProvider` port — a narrow, framework-agnostic, event-based TypeScript interface — plus a simulated adapter that can be driven to return each of the three outcomes the MVP requires (`succeeded`, `failed`, `pending`), and a way for the checkout surface to present each outcome distinctly to the shopper.

A real card gateway confirms payments **asynchronously**, so `pending` is a first-class outcome from day one and the abstracted result is an event, not a boolean. Store code (checkout, order flows, UI) depends only on the interface and the event shape, so a real gateway can be dropped in behind it later without touching store code. This feature is the abstraction and its simulation only: it does not create orders, persist payments, reserve stock, create accounts, or build the checkout flow.

## Non-Goals

- Creating orders, freezing prices, or writing `payment` / `order` rows (owned by `order-creation-on-payment` and `payment-failure-path`).
- Stock reservation or consumption (owned by `stock-reservation`).
- Account creation/linking at payment time (owned by `account-created-at-payment`).
- The full checkout flow: contact/address/shipping/sales-tax steps (owned by the `checkout-*` features) and the checkout page/route.
- Any real payment gateway, card data, 3-D Secure, PCI scope, or webhook endpoint (explicitly excluded by `docs/mvp-scope.md`).
- `cancelled` as a provider outcome — cancellation is a shopper/session action, not something the simulated provider returns. The DB enum already carries it; wiring it belongs to a later feature.
- Concurrency/idempotency guarantees across simultaneous retries — the simulated provider is deterministic per call; persistence-backed idempotency arrives with order creation.

## Job Story

When a shopper submits payment at checkout,
I want the payment to run through one provider interface that reports success, failure or pending as a clear event,
so the checkout can show the shopper exactly what happened and a real gateway can replace the simulation later without rewriting the store.

## Users And Permissions

- **Guest / Customer (shopper)**: sees the outcome of their own payment attempt; never sees provider internals, refs beyond an opaque reference, or card data.
- **Implementer of a future real gateway**: implements the same `PaymentProvider` interface behind the port; must not require changes to the mapper or checkout component.
- **No admin surface** in this feature.

## Acceptance Scenarios

### Scenario 1: Narrow, framework-agnostic, event-based port

Given the payments module
When a consumer initiates a payment
Then it calls a single method on `PaymentProvider` and receives a discriminated `PaymentEvent` (`payment.succeeded` | `payment.failed` | `payment.pending`)
And the port types import no Next.js, React, database, or network code, so another implementation can be substituted without touching store code.

### Scenario 2: Simulated provider returns each outcome on demand

Given the simulated provider is configured (or asked per request) to resolve `succeed`, `fail`, or `pending`
When `createPayment` is called
Then it resolves with the corresponding event type and a non-empty opaque `providerRef`
And the event echoes the requested `amountCents` (integer cents) and currency `USD` unchanged, with no floating-point arithmetic.

### Scenario 3: Each outcome is surfaced distinctly to the shopper

Given a payment event of each type
When the checkout delivery surface renders it
Then `succeeded`, `failed` and `pending` each produce a distinct, clearly labelled state (distinct heading, message and `data-outcome` value)
And `pending` is **not** presented as success or failure
And `failed` states that no charge was made and offers a retry affordance
And no state relies on colour alone to convey meaning.

### Scenario 4: Amounts stay integer cents in USD

Given any request amount (e.g. `24900`)
When the provider returns an event and the mapper produces a view
Then the amount is carried as an integer number of cents and rendered as USD (e.g. `$249.00`); no float division is stored or compared.

## Repository Research

### Files Inspected

- `feature_list.json` — the `payment-provider-abstraction` entry (verification is provisional; 3 outcomes + checkout surfacing) and its dependents `order-creation-on-payment`, `payment-failure-path`.
- `ARCHITECTURE.md` → *Layering Intent*: already names `PaymentProvider` as a port "simulated in the MVP, real gateway later (docs/specs/ for `payment-provider-abstraction`)". The port is specified but not yet realised in code.
- `CONTEXT.md` — glossary: **Payment** (a payment attempt, simulated but modelled as real), **Payment Provider** (rejected term: "Payment Gateway"), **Payment Status** `pending → succeeded / failed / cancelled`.
- `db/schema/enums.ts` — `paymentStatus` pgEnum is `["pending","succeeded","failed","cancelled"]`; the outcome vocabulary must align with `pending`/`succeeded`/`failed`.
- `db/schema/order.ts` — `payment` table (`orderId`, `status`, `provider default 'simulated'`, `amountCents bigint`) exists but is **not** used by this feature.
- `db/client.ts` / `db/catalog.ts` — data-access pattern; money is `bigint` integer cents, `formatPriceUSD(cents)` already lives in `db/catalog.ts`.
- `app/catalog/page.tsx`, `app/catalog/product-card.tsx` — App Router Server Components; component + page test style; `data-testid` hooks; CSS via `app/globals.css` custom-property tokens.
- `app/catalog/page.test.tsx` — UI test pattern: `render`, `screen`, `vi.mock` for data layer; Vitest globals.
- `db/tests/catalog-listing.test.ts` / `db/tests/harness.ts` — DB test pattern (not needed here; this feature has no DB dependency).
- `vitest.config.mts` — two projects: `ui` (jsdom, includes all `**/*.test.ts(x)` excluding `db/**`) and `db` (node, `db/**`). Pure unit tests therefore run in the `ui` project.
- `CONSTRAINTS.md` — money MUST be integer cents USD (rule 1); the test suite MUST stay self-contained (rule 4).
- `docs/technical-discovery.md` → *Integrations* and *Testing and Verification*: payment is simulated behind the interface; integration tests use a fake `PaymentProvider`; order/payment events are logged as domain events.
- `docs/risks-and-open-questions.md` → *Risks* ("keep `PaymentProvider` narrow and event-based; design for asynchronous confirmation now") and *Implementation-Time Questions* ("whether `pending` payment state is exposed to the shopper or collapsed to a single 'processing' message").
- `DESIGN.md` — zero-radius, hairline-border, ink/stone/steel palette; success/failure/pending states are **not** covered by the design references (noted as a gap).
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — a component needs `"use client"` only for state/handlers/browser APIs; a presentational component stays a Server Component.

### Existing Patterns To Follow

- Framework-agnostic domain modules import only TypeScript/Node; UI is thin and lives under `app/`.
- Money is integer cents (`bigint`) with `currency = 'USD'`; format via `Intl.NumberFormat` as in `formatPriceUSD`.
- Vitest runs with `globals: true`; tests use `Given/When/Then`-style `it("scenario N: …")` names and `data-testid` queries.
- The `db` directory is the model for a self-contained domain folder; a sibling root module keeps layering (UI → services → domain → ports → adapters) visible.

### Current Gaps

- No payments module, no `PaymentProvider` implementation, no checkout route or component exists yet.
- The USD formatter was `formatPriceUSD` inside `db/catalog.ts`; this feature extracts it to the framework-agnostic `lib/money.ts` (re-exported by `db/catalog.ts`) so the mapper can render USD without importing `db/`.
- No design reference for payment outcome states; use existing tokens with text + border, not new colours.
- No browser E2E harness exists (`ARCHITECTURE.md`); focused unit/component tests are the appropriate evidence.

## Technical Approach

1. **Port module** `payments/payment-provider.ts` (framework-agnostic, no `next`/`react`/`db` imports):
   - `PaymentOutcome = "succeeded" | "failed" | "pending"`.
   - `PaymentFailureReason = "card_declined" | "insufficient_funds" | "provider_error"`.
   - `PaymentRequest = { reference: string; amountCents: number; currency: "USD"; method: { kind: "card"; token: string } }` — the `method` carries an opaque token, never a raw card number.
   - `PaymentEvent` discriminated union on `type`: `payment.succeeded` / `payment.failed` (with `reason`) / `payment.pending`, each carrying `providerRef`, `amountCents`, `currency`.
   - `PaymentProvider` interface with one narrow initiation method: `createPayment(request: PaymentRequest): Promise<PaymentEvent>` and a readonly `id: string`. Asynchronous confirmation is represented by `pending` plus the stable `providerRef`; a future gateway can add a reconciliation/webhook path behind the same event shape.
2. **Simulated adapter** `payments/simulated-provider.ts`:
   - `createSimulatedPaymentProvider(options?: { scenario?: PaymentScenario | ((request: PaymentRequest) => PaymentScenario | Promise<PaymentScenario>); failureReason?: PaymentFailureReason }): PaymentProvider`.
   - `PaymentScenario = "succeed" | "fail" | "pending"`; default scenario `"succeed"`; default failure reason `"card_declined"`.
   - Deterministic, synchronous-in-effect (resolves immediately), no network, no timers required, no DB. Produces a stable, non-guessable-looking opaque `providerRef` derived from the request reference (e.g. `sim_<reference>`); echoes `amountCents`/`currency`/`reference` unchanged.
3. **Outcome mapping** `payments/payment-outcome.ts` (pure, no React/DB/network):
   - `PaymentOutcomeView = { outcome: PaymentOutcome; title: string; message: string; retryable: boolean; amountCents: number; amountLabel: string }` — the integer cents are carried through unchanged and `amountLabel` is the USD rendering.
   - `describePaymentOutcome(event: PaymentEvent): PaymentOutcomeView` sets `amountCents = event.amountCents` (a validated integer) and `amountLabel = formatPriceUSD(event.amountCents)`, with English copy:
     - `succeeded` → "Payment confirmed" / "Your payment was approved. We're preparing your order." / `retryable: false`.
     - `failed` → "Payment failed" / "We couldn't process your payment. No charge was made and your cart is unchanged." / `retryable: true`.
     - `pending` → "Payment pending" / "Your payment is still being confirmed. We'll update this page once the provider responds." / `retryable: false`.
4. **Shared money formatter** `lib/money.ts` (framework-agnostic, no `next`/`react`/`db`/network):
   - `formatPriceUSD(cents: number): string` — formats integer cents as USD (e.g. `24900` → `"$249.00"`). The mapper imports this directly; the data layer (`db/catalog.ts`) re-exports it, so there is **one** formatter and the mapper never imports `db/`.
5. **Checkout delivery surface** `app/checkout/payment-outcome.tsx`:
   - Presentational Server Component `PaymentOutcomeNotice({ view }: { view: PaymentOutcomeView })` (no `"use client"`, no handlers). Renders `data-testid="payment-outcome"`, `data-outcome={view.outcome}`, an `<h2>` title, the `amountLabel` in a `.payment-outcome__amount` element (`data-testid="payment-outcome-amount"`), a message, an `aria-live="polite"` wrapper, and a non-interactive retry hint when `view.retryable` is true (the interactive retry is wired by the checkout feature later).
   - Styles in `app/globals.css` as `.payment-outcome*`: zero radius, hairline border, existing tokens; pending distinguished from failure by label/text and border treatment, not colour alone.
6. **No route, no server action, no API route**: the component is rendered by the future checkout feature; creating `app/checkout/` without a `page.tsx` is intentional and valid in the App Router.
7. **Tests** (Vitest `ui` project, no DB/network): provider outcomes, mapping (including integer-cents → USD rendering), and component rendering, plus one end-to-end-in-process test that drives the simulated provider per scenario → maps → renders.

## Expected File Changes

- `docs/specs/payment-provider-abstraction.md` — create; this spec.
- `payments/payment-provider.ts` — create; port types, `PaymentEvent` union, `PaymentProvider` interface.
- `payments/simulated-provider.ts` — create; `createSimulatedPaymentProvider` adapter.
- `payments/payment-outcome.ts` — create; pure `describePaymentOutcome` mapping (carries `amountCents`, renders `amountLabel`).
- `lib/money.ts` — create; shared framework-agnostic `formatPriceUSD` used by both the mapper and the data layer.
- `db/catalog.ts` — modify; re-export `formatPriceUSD` from `lib/money.ts` (single shared formatter).
- `payments/simulated-provider.test.ts` — create; provider outcome/amount tests.
- `payments/payment-outcome.test.ts` — create; mapping tests (including integer cents → USD rendering).
- `app/checkout/payment-outcome.tsx` — create; presentational outcome component.
- `app/checkout/payment-outcome.test.tsx` — create; component + provider→view integration test.
- `app/globals.css` — modify; `.payment-outcome*` styles using existing tokens.
- `ARCHITECTURE.md` — modify; record that the `PaymentProvider` port and simulated adapter are now realised in `payments/` (Layering Intent/Status).
- `docs/risks-and-open-questions.md` — modify; resolve the "whether `pending` is exposed or collapsed" implementation-time question (it is surfaced distinctly).
- `feature_list.json`, `PROGRESS.md` — modify; status, evidence, session log.

## Visual Design Impact

- UI involved: yes (one presentational component).
- Design source: `DESIGN.md` (existing tokens; no new colours).
- Screens or states affected: the checkout payment step's outcome region — three states: `pending`, `succeeded`, `failed`, each showing the amount rendered as USD. No full checkout screen is built.
- New design artifact required: no. The references do not cover payment outcome states; use existing tokens (ink/stone, hairline border, zero radius) and label + text so meaning is not colour-only (`DESIGN.md` accessibility baseline). Full checkout visual treatment is deferred to the `checkout-*` features.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — the *Layering Intent* names `PaymentProvider` as a planned port; the feature realises it in `payments/` (port + simulated adapter) and extracts the shared USD formatter to `lib/money.ts`. Mark it so the port is no longer described as un-codeified.
- `CONSTRAINTS.md`: not needed — money-as-integer-cents (rule 1) and self-contained tests (rule 4) already cover this feature; no new durable MUST/MUST NOT is introduced.
- `AGENTS.md`: not needed — no workflow, startup path, or command change (only test files are added).
- `docs/risks-and-open-questions.md`: update — resolve the `pending`-exposure implementation-time question.
- `docs/technical-discovery.md`: not needed — the *Integrations*/*Testing* entries already describe a simulated provider; no decision changes.

## Implementation Plan

1. Define the port types and `PaymentProvider` interface in `payments/payment-provider.ts` (no framework/DB imports).
2. Implement `createSimulatedPaymentProvider` in `payments/simulated-provider.ts`, driven by the `scenario` option/function, echoing amounts unchanged.
3. Extract `formatPriceUSD` from `db/catalog.ts` into the shared framework-agnostic `lib/money.ts` (re-exported by `db/catalog.ts`).
4. Implement `describePaymentOutcome` in `payments/payment-outcome.ts`, carrying integer `amountCents` and rendering `amountLabel` (via `lib/money.ts`).
5. Build the presentational `PaymentOutcomeNotice` component and add `.payment-outcome*` styles.
6. Write the three test files (provider, mapper including integer-cents → USD, component + in-process provider→view loop).
7. Update `ARCHITECTURE.md`, `docs/risks-and-open-questions.md`, `feature_list.json`, `PROGRESS.md`; run the full gate.

## Implementation Tasks

- [ ] Create `payments/payment-provider.ts` with `PaymentOutcome`, `PaymentFailureReason`, `PaymentRequest`, `PaymentEvent` union, and the single-method `PaymentProvider` interface.
- [ ] Create `payments/simulated-provider.ts` exporting `PaymentScenario`, `createSimulatedPaymentProvider`, and an `id` of `"simulated"`.
- [ ] Ensure `createPayment` echoes `amountCents`/`currency`/`reference` unchanged and returns a stable non-empty `providerRef`.
- [ ] Create `payments/payment-outcome.ts` with `PaymentOutcomeView` (including `amountCents` + `amountLabel`) and `describePaymentOutcome` (English copy; `failed.retryable === true`, `pending/succeeded.retryable === false`).
- [ ] Extract `formatPriceUSD` into the shared framework-agnostic `lib/money.ts` and re-export it from `db/catalog.ts` so the mapper formats USD without importing `db/`.
- [ ] Create `app/checkout/payment-outcome.tsx` (`PaymentOutcomeNotice`) with `data-testid="payment-outcome"`, `data-outcome` per state, and the rendered `amountLabel` (`data-testid="payment-outcome-amount"`).
- [ ] Add `.payment-outcome*` styles to `app/globals.css` using existing tokens (zero radius; no colour-only signalling).
- [ ] Add `payments/simulated-provider.test.ts` covering `succeed`/`fail`/`pending` and integer-cent echoing.
- [ ] Add `payments/payment-outcome.test.ts` covering all three mappings, retryability, and integer cents → USD rendering ($249.00).
- [ ] Add `app/checkout/payment-outcome.test.tsx` covering distinct rendering per outcome plus the provider→mapper→component loop.
- [ ] Update `ARCHITECTURE.md` *Layering Intent* to record the realised port/adapter and `payments/` module.
- [ ] Resolve the `pending`-exposure question in `docs/risks-and-open-questions.md`.
- [ ] Update `feature_list.json` (status/evidence) and `PROGRESS.md` (session log).

## Verification Plan

- `pnpm test` — Vitest `ui` project runs the three new test files green; no database or network is required (the `db` project is unaffected).
- `pnpm lint` — zero ESLint errors/warnings.
- `pnpm typecheck` — zero TypeScript diagnostics; the port module imports no `next`/`react`/`db`.
- `pnpm build` — production build completes cleanly (`app/checkout/` has no route, so no new route is emitted).
- `./init.sh` — executes the standard non-blocking gate (install + lint + typecheck + test) and exits 0; it must not start a dev server.
- E2E: no persistent browser E2E harness exists in this repo (`ARCHITECTURE.md` → Verification Stack). This feature has no page/route/API flow, only a presentational component plus a pure module; focused unit/component tests in the `ui` project are the correct coverage. Adding an E2E harness is out of scope for this feature.

## Evidence To Capture

- `./init.sh` output showing exit 0 and the new ui test files listed.
- Exact test names:
  - `payments/simulated-provider.test.ts` — "scenario 1: returns a succeeded event when the scenario is succeed", "scenario 2: returns a failed event with a reason when the scenario is fail", "scenario 3: returns a pending event when the scenario is pending", "echoes the amount in integer cents and USD unchanged".
  - `payments/payment-outcome.test.ts` — "maps a succeeded event to a confirmable success view", "maps a failed event to a retryable failure view", "maps a pending event to a pending view that is not presented as success", "carries the amount as integer cents and renders it as USD".
  - `app/checkout/payment-outcome.test.tsx` — "renders a distinct success state for a succeeded payment", "renders a distinct failure state with a retry affordance for a failed payment", "renders a distinct pending state that is not shown as success or failure", "drives the simulated provider through succeed/fail/pending and surfaces each outcome".
- `pnpm build` output showing a clean build.
- Record the deliberately resolved open question (`pending` is surfaced distinctly) in `docs/risks-and-open-questions.md`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope: no order creation, no DB writes, no checkout page, no account/stock logic, no real gateway.
- [ ] The port imports no Next.js/React/DB/network code and exposes a narrow, event-based surface; a second implementation can be substituted without touching the mapper or component.
- [ ] All four acceptance scenarios pass; `pending` is first-class and never presented as success/failure.
- [ ] Money remains integer cents USD; no float arithmetic on amounts.
- [ ] Verification commands (`./init.sh`, `pnpm build`, `pnpm test`) ran and evidence is recorded in `feature_list.json`/`PROGRESS.md`.
- [ ] E2E omission is justified (no page/API flow; no harness exists).
- [ ] `ARCHITECTURE.md` and `docs/risks-and-open-questions.md` updated as stated; `feature_list.json` and `PROGRESS.md` updated correctly.
- [ ] No unrelated product behaviour or extra feature work was added.

## Open Questions

- **Interactive retry is deferred, not omitted.** `failed` renders a retry *hint* only; the actionable retry control (and its wiring to re-run `createPayment`) belongs to `payment-failure-path`. Resolved choice: this feature provides the non-interactive surface so the checkout feature can attach behaviour without re-specifying copy/states.
- **Provider `cancelled` outcome** is intentionally not implemented — it is a session/shopper action, not a simulated provider result. Flagged for a later feature rather than silently added.
