# Validation: product-variant-selection

- Feature id: `product-variant-selection`
- Spec: `docs/specs/product-variant-selection.md`
- Validated: 2026-10-19
- Validator: `feature-validator` (independent re-run; implementer evidence not trusted)
- Claimed status on entry: `passing`
- Verdict: **accept**
- Recommended state update: orchestrator sets `feature_list.json` status to `accepted`

## Scope Reviewed

- `db/catalog.ts` — `ProductDetailVariant`, `ProductDetail.variants`, `getPublishedProductBySlug` variant query.
- `app/products/[slug]/variant-selection.ts` — pure options/selection/parse/price/stock/label/href model.
- `app/products/[slug]/variant-selector.tsx` — client selector, ARIA state, live region, `history.replaceState`.
- `app/products/[slug]/page.tsx` — async `searchParams`, initial selection, selector wiring.
- `app/products/[slug]/page.test.tsx`, `app/products/[slug]/variant-selection.test.ts`,
  `app/products/[slug]/variant-selector.test.tsx`, `db/tests/product-variant-selection.test.ts`.
- `app/globals.css` variant styles, `ARCHITECTURE.md` durable notes, `feature_list.json` / `PROGRESS.md` state.
- No schema or migration files changed (`git status --porcelain db/schema db/migrations` empty).

## Checks Re-run (independent)

| Check | Command | Result |
| --- | --- | --- |
| Standard gate | `./init.sh` | exit 0; install + lint + typecheck + test; **21 test files / 140 tests passed** |
| Lint | `pnpm lint` | exit 0, zero findings |
| Typecheck | `pnpm typecheck` | exit 0, zero diagnostics |
| Production build | `env -u DATABASE_URL pnpm build` with the local `.env` temporarily moved aside | exit 0; route table `/` and `/_not-found` static, `/api/chat`, `/catalog`, `/products/[slug]` dynamic (`ƒ`); only the pre-existing `db/env.ts` tracing warning |
| Focused UI suites | `pnpm vitest run --project ui` on the three variant/page suites | 3 files / 35 tests passed |
| DB integration | included in `./init.sh` | 4 `product-variant-selection` DB tests passed (payload, ordering, override, discontinued exclusion, published-only) |
| Live HTTP | disposable embedded PostgreSQL 17 (`pnpm db:devdb`) + `pnpm db:migrate`/`db:seed`/`db:verify` + `pnpm dev` on PORT 3011 | migrate/seed/verify exit 0 (9 products / 40 variants / 16 images); transcript below |
| Browser URL behavior | headless Chrome 155 via CDP against the live dev server | `replaceState` behavior confirmed (below) |

The embedded database URL was read from the `db:devdb` log and never printed.

## Live Transcript (disposable DB, PORT 3011)

| Request | HTTP | Observed |
| --- | --- | --- |
| `/products/double-breasted-linen-blazer?size=M&color=Ivory` | 200 | `$249.00`, tax-exclusive note, `In stock — 12 available.` |
| `/products/double-breasted-linen-blazer?size=XL&color=Navy` | 200 | `$229.00` (override wins), `In stock — 7 available.` |
| `/products/double-breasted-linen-blazer?size=xl&color=navy` | 200 | `$229.00`, canonicalized case-insensitively |
| `/products/double-breasted-linen-blazer` | 200 | base `$249.00`, `Select a size and color to see availability.` |
| `/products/longline-wool-overcoat` | 200 | base `$349.00`, prompt; size options S/M/L, color options Camel/Charcoal with stored hexes `#C19A6B` / `#3B4045`; S tile `S — Out of stock`, `aria-disabled="true"`, `data-state="out_of_stock"` |
| `/products/longline-wool-overcoat?size=S&color=Camel` | 200 | no selection, base `$349.00`, prompt |
| `/products/longline-wool-overcoat?color=Camel` | 200 | `Select a size to see availability.`; S out of stock |
| `/products/longline-wool-overcoat?size=XXL&color=Nope` | 200 | no selection, no error, prompt |
| `/products/cropped-tweed-jacket` (draft) | 404 | branded not-found |
| `/products/no-such-slug` | 404 | branded not-found |

HTML inspection of the blazer deep link also showed: `fieldset`/`legend` groups `Size` and `Color`,
`aria-pressed="true"` on XL and Navy, reason-bearing `aria-label`s on unavailable options
(`S — Not available in Navy`, `Ivory — Not available in size XL`), and exactly one
`aria-live="polite"` region announcing `XL / Navy. $229.00. In stock — 7 available.`

### Headless Chrome `replaceState` transcript

Starting from `/products/double-breasted-linen-blazer` with `history.length = 3`, `scrollY = 0`:

1. Click size M → URL `?size=M`, `history.length = 3`, `scrollY = 0`, `aria-pressed="true"` on M,
   stock message switches to `Select a color to see availability.`
2. Click color Ivory → URL `?size=M&color=Ivory`, `history.length = 3`, `scrollY = 0`,
   price `$249.00`, `In stock — 12 available.`, live region
   `M / Ivory. $249.00. In stock — 12 available.`

On the overcoat after selecting Camel: clicking the out-of-stock S tile left URL, price, stock message,
`aria-pressed`, and `history.length` unchanged. The S tile remained focusable (`document.activeElement`
was the button, no native `disabled`), confirming the reason stays discoverable and activation is a
guarded no-op.

## Acceptance Scenarios

- **Scenario 1 — options derived from variants: PASS.** Live overcoat options S/M/L + Camel/Charcoal with
  stored hexes and visible names; DB test inserts a discontinued XS/Black row and proves it never reaches
  the payload while the zero-stock Camel/S row remains.
- **Scenario 2 — base price: PASS.** M/Ivory renders `$249.00`, tax-exclusive note, 12 available.
- **Scenario 3 — override price: PASS.** XL/Navy renders `$229.00` and 7 available; price computed as
  integer `priceOverrideCents ?? basePriceCents` and formatted only through `lib/money.ts`'s
  `formatPriceUSD`.
- **Scenario 4 — out-of-stock disabled: PASS.** S is slashed/muted, `aria-disabled="true"`, named
  `S — Out of stock`, focusable, and a click is a no-op; before a color is chosen S is also unselectable.
- **Scenario 5 — partial selection: PASS.** Base price plus tax note until a full variant is selected;
  exact copy for none / missing color / missing size.
- **Scenario 6 — deep links and URL: PASS.** Valid pair restored (including case-insensitive input),
  out-of-stock pair and unknown values render the empty prompt without error; `history.replaceState`
  updates the URL in place with canonical values, no new history entry, no scroll jump.
- **Scenario 7 — accessibility: PASS.** Labelled `Size`/`Color` fieldset groups, focusable buttons in
  reading order, `aria-pressed` on selected, `aria-disabled` plus reason in the accessible name on
  unavailable options, selected state shown by fill/ring/check plus visible names, one polite live region.

No browser E2E harness exists in this repo (documented in `ARCHITECTURE.md`); jsdom/Testing Library
coverage plus the validator's headless-Chrome transcript is the appropriate verification surface here.

## Findings

No Critical, High, or Medium findings.

### Low: live region is populated on first render

- Severity: Low
- Evidence: `app/products/[slug]/variant-selector.tsx` renders the announcement text in the SSR output;
  the region is visually hidden and `aria-live="polite"`.
- Why it matters: Some screen readers may announce the initial text on load, before any user action.
- Required change: none for acceptance; if desired later, render an empty live region until the first
  selection change.
- Verification after change: existing `variant-selector.test.tsx` live-region assertions still pass.

### Low: selector state is initialized once from props

- Severity: Low
- Evidence: `useState(initialSelection)` in `variant-selector.tsx`.
- Why it matters: A client-side navigation to the same route with different `?size=&color=` would reuse
  the mounted component and keep the old state. No such navigation exists in this slice (no in-page links
  to the same product with different params; external/deep links reload).
- Required change: none now; if same-route links are added later, re-sync state on `initialSelection`
  change.
- Verification after change: add a client-navigation test.

### Low: single valid dimension plus one unknown value keeps the valid dimension

- Severity: Low
- Evidence: `parseVariantSelection` returns `{ size: "M" }` for `?size=M&color=Pink`; both-unknown params
  return `{}`.
- Why it matters: This follows the spec's "unknown values are ignored, never thrown" rule and the
  single-dimension rule; recorded so future readers do not mistake it for a bug. No acceptance scenario
  requires dropping the valid dimension.

## Scope Discipline

- No add-to-cart, quantity, cart state, checkout, try-on, FITIQ/fit prediction, wishlist, cross-sell,
  reviews, or variant-specific imagery. The gallery, title, description and composition/care markup are
  unchanged.
- No admin/backoffice, search/filter/sort, schema, or migration changes.
- Money stays integer cents; no float/string money path was introduced.
- `getPublishedProductBySlug` remains published-only and now additionally filters `discontinued = false`
  for variants.

## Security Assessment

Feature-scoped checklist result: **no relevant issues, no blocking findings.**

- No secrets in the diff; `.env` remains gitignored and the validation run did not print the database URL.
- Query params are only compared against stored option values; unknown values are ignored. No SQL is
  built from params (Drizzle parameterized query); no HTML interpolation of params (React escapes).
- `colorHex` comes from the trusted catalog row and is applied through React's `style` (CSSOM), not raw
  HTML.
- The client component imports only the pure money helper and erased type-only catalog imports; no DB or
  server module reaches the client bundle.
- Public data only (catalog variant details and stock availability), consistent with the spec; no
  personal data, auth, writes, or external calls.

## Documentation / Harness State

- `ARCHITECTURE.md` records storefront-visible variants and the client-selection/URL-mirroring model, and
  the repository layout lists the selector/pure model.
- `CONSTRAINTS.md` needed no change (integer-cents rule already covers overrides); `AGENTS.md` unchanged.
- `feature_list.json` records 6 scenario-mapped verification entries and 8 evidence entries; status left
  as `passing` for the orchestrator.
- `PROGRESS.md` Session 015 matches the observed implementation and verification.

## Cleanup

Validator started a disposable embedded PostgreSQL, a dev server on port 3011, and a headless Chrome
instance. All were stopped; port 3011 and the embedded PostgreSQL port are free, the validator's embedded
data directory was removed, and `.env` was restored unchanged. No commits, pushes, or PRs were made.
