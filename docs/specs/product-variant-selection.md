# Feature Implementation Spec: Shopper selects a size and color variant

## Source Feature

- `id`: `product-variant-selection`
- `area`: `catalog`
- `depends_on`: `["product-detail-page"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Make the product detail page sellable at the option level: derive the size and color options from the product's variants, render them as an accessible selector, disable combinations that cannot be bought (out of stock or not offered), and drive the displayed price and stock message from the selected variant. A selected variant's `priceOverrideCents` wins over the product `basePriceCents`; money stays integer cents and is rendered only through `lib/money.ts`'s `formatPriceUSD`.

Selection is client-side view state so price and availability update instantly, while a shallow `history.replaceState` keeps `?size=M&color=Camel` in the URL so a selected variant is shareable and survives reload. This feature stops at selection: it does not add to a cart.

## Non-Goals

- Add to cart, buy buttons, quantity, cart lines, cart state, checkout (owned by `guest-cart-add` onward).
- Stock reservation, add-to-cart stock limits, or mutating `stock_qty` (owned by `cart-stock-limits` / `stock-reservation`).
- Virtual try-on, photo upload, try-on targeting a variant (owned by virtual try-on features).
- Fit recommendation / FITIQ, AI Stylist cross-sell, recommendations, reviews, wishlist.
- Variant-specific imagery: the gallery remains product-level in this slice.
- Admin variant/stock management (backoffice features).
- Search, filtering or sorting changes on `/catalog`.

## Job Story

When a shopper is studying a garment on its product detail page,
I want to choose an available size and color and immediately see the exact price and whether it is in stock,
so I can decide whether this specific variant is worth buying before I add it to the cart.

## Users And Permissions

- Anonymous shopper (guest): can view options and select any available combination on a published product; no account required.
- Anonymous shopper: cannot select an out-of-stock or unoffered combination, including by crafting a URL.
- Discontinued variants are not exposed to the storefront at all.
- No authentication, admin gate, writes, or personal data are involved.

## Acceptance Scenarios

### Scenario 1: Options are derived from the product's variants

Given a published product `longline-wool-overcoat` whose non-discontinued variants are Camel S/M/L and Charcoal M/L (Camel S has stock 0)
When the detail page renders
Then the size group offers S, M and L and the color group offers Camel and Charcoal
And every color option carries its stored swatch hex and visible color name
And a discontinued variant inserted for that product (e.g. XS / Black) is absent from both groups.

### Scenario 2: A selected variant drives the displayed price (base price)

Given the published product `double-breasted-linen-blazer` with base price `24900` and an M / Ivory variant with no override in stock
When the shopper selects size M and color Ivory
Then the page displays `$249.00` and the tax-exclusive note
And the stock message reports that the variant is in stock with its available quantity.

### Scenario 3: A selected variant drives the displayed price (price override)

Given the same product has an XL / Navy variant with `priceOverrideCents: 22900` and stock 7
When the shopper selects size XL and color Navy
Then the displayed price is `$229.00`, not the `$249.00` base price
And the stock message reports 7 available
And the price is formatted from integer cents through `formatPriceUSD`.

### Scenario 4: An out-of-stock combination is visibly disabled and cannot be selected

Given `longline-wool-overcoat` has a Camel / S variant with `stockQty: 0`
When the shopper selects color Camel
Then the S size tile is rendered in a disabled, slashed out-of-stock state
And its accessible name states that it is out of stock
And activating it does not change the selection, the price, or the stock message
And before any color is chosen, S is also unselectable because no S variant is available.

### Scenario 5: Partial selection prompts for the missing dimension

Given no valid variant is selected
When the page first renders, or only one dimension has been chosen
Then the displayed price remains the product base price and the note stays tax-exclusive
And the stock message asks for the missing dimension ("Select a color to see availability." / "Select a size to see availability."), or for both when nothing is selected.

### Scenario 6: A shared URL restores a valid selection and rejects an invalid one

Given the detail page is opened at `/products/double-breasted-linen-blazer?size=XL&color=Navy`
When the page renders
Then XL and Navy are shown as selected and the price is `$229.00`
And opening `?size=S&color=Camel` on the overcoat (out-of-stock pair) or params naming unknown values renders with no selection, no error, and the prompt message
And after a shopper changes a selection, the URL is updated in place (no new history entry, no scroll jump) with the canonical size/color values.

### Scenario 7: The selector is keyboard and screen-reader operable

Given the selector is rendered
When a keyboard or screen-reader user navigates it
Then Size and Color are each exposed as a labelled group, every option is focusable in reading order, the selected option exposes `aria-pressed="true"`, and unavailable options expose `aria-disabled="true"` plus a reason in their accessible name
And the selected state is not conveyed by color alone (border/fill plus the color name)
And each selection change updates a single polite live region announcing the variant, price and availability.

## Repository Research

### Files Inspected

- `app/products/[slug]/page.tsx` — server detail route: async `params`, `force-dynamic`, `getPublishedProductBySlug`, price rendered statically from `basePriceCents`, `notFound()` outside `try/catch`.
- `app/products/[slug]/product-gallery.tsx` — client-component pattern for interactive detail UI.
- `app/products/[slug]/page.test.tsx` — UI test pattern; its `ProductDetail` fixture must gain `variants` once the type changes.
- `db/catalog.ts` — `ProductDetail`, `getPublishedProductBySlug`, `listVariantsByProductId`, `deriveVariantAvailability`, `formatPriceUSD` re-export.
- `db/schema/catalog.ts` — `variant` has `size`, `color`, `colorHex`, `stockQty`, nullable `priceOverrideCents`, `discontinued`, unique `(productId,size,color)`; `product.basePriceCents` is integer cents.
- `db/seed-data.ts` — deterministic fixtures: overcoat Camel S is stock 0; blazer XL Navy overrides to 22900; no seeded variant is discontinued (tests must insert one).
- `db/tests/product-detail.test.ts`, `db/tests/harness.ts` — embedded-PostgreSQL integration pattern and seed helpers.
- `app/catalog/filter-bar.tsx`, `app/catalog/filter-params.ts` — repo precedent for a client toolbar plus pure, unit-tested URL helpers.
- `lib/money.ts` — framework-agnostic `formatPriceUSD(cents)`; safe to import from a client component.
- `app/globals.css` — existing `.product-detail*` / `.product-gallery*` editorial styles to extend.
- `DESIGN.md` — size tiles are border-only rectangles that go solid ink when selected; out-of-stock uses a diagonal hairline slash; swatches may be circular; zero radius otherwise; no color-only state.
- `ARCHITECTURE.md` — `/products/[slug]` is dynamic and public; Next 16 `searchParams` is a Promise; no browser E2E harness.
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` — `window.history.replaceState(null, "", newPath)` updates the URL without a reload and integrates with the Next router; `01-app/03-api-reference/03-file-conventions/page.md` — `searchParams` is awaited.

### Existing Patterns To Follow

- Pages read data only through `db/catalog.ts`; they never query tables directly.
- Pure view logic lives in a route-local module with unit tests (`app/catalog/filter-params.ts` precedent).
- Prices are always integer cents until `formatPriceUSD` renders them.
- Interactive UI is a client component receiving serializable props from a server page.
- Tests use `data-testid` hooks, Vitest `ui` (jsdom) and `db` (embedded PostgreSQL) projects.

### Current Gaps

- `ProductDetail` carries no variants; the detail route has no selector.
- No pure variant-option/selection helper and no UI component for the size/color matrix.
- `page.tsx` has no `searchParams` handling; `page.test.tsx` has no variant fixtures.

## Technical Approach

1. **Data access (`db/catalog.ts`, modify).** Add `ProductDetailVariant { id, size, color, colorHex, stockQty, priceOverrideCents: number | null }` and a required `variants: ProductDetailVariant[]` field on `ProductDetail`. In `getPublishedProductBySlug`, after loading the product, query `variant` for that product id with `discontinued = false`, ordered by `size` then `color` ascending (the Postgres enum order is XS→XL; colors alphabetical, matching catalog filter options). Do not return discontinued rows to the storefront. No schema change or migration: every column exists.
2. **Pure selection model (`app/products/[slug]/variant-selection.ts`, create).** No React/Next/DB client code; type-only imports are fine. Export:
   - `VariantSelection = { size?: VariantSize; color?: string }`
   - `getSizeOptions(variants)` / `getColorOptions(variants)` — distinct values in presentation order, derived only from the non-discontinued variants.
   - `isCombinationSelectable(variants, size, color)` — true only when the exact variant exists and `stockQty > 0`.
   - `selectSize(variants, current, size)` / `selectColor(...)` — return the next selection. With no other axis chosen, accept a value only if it has at least one available variant; with the other axis chosen, accept only when that exact pair is selectable. Otherwise return `current` unchanged (the UI also marks such options `aria-disabled`).
   - `getSelectedVariant(variants, selection)`, `getDisplayPriceCents(basePriceCents, variant)` (`variant?.priceOverrideCents ?? basePriceCents`), `getStockMessage(selection, variant)`, `buildVariantHref(pathname, selection)`. Exact status copy: `Select a size and color to see availability.`, `Select a color to see availability.`, `Select a size to see availability.`, `In stock — {n} available.`, and `Out of stock.` defensively when a supplied variant has no stock.
   - `parseVariantSelection(searchParams, variants)` — accepts only params naming existing options; size is matched case-insensitively to the enum, color case-insensitively to the stored name and canonicalized. A single dimension is kept only when it has at least one available variant; a full pair is kept only when that exact combination is selectable. A pair or dimension that is not selectable (missing or stock 0) resolves to an empty selection. Unknown values are ignored, never thrown.
   - Option state helper for rendering: selectable / out of stock (exists, stock 0) / unavailable in the other selected axis.
3. **Page (`app/products/[slug]/page.tsx`, modify).** Await `searchParams: Promise<Record<string, string | string[] | undefined>>` (Next 16), resolve the initial selection from the product's variants, and replace the static price block with `<VariantSelector variants basePriceCents initialSelection />` in the commentary column. Keep the gallery, name, description and composition/care markup unchanged. Keep database-error fallback and `notFound()` outside `try/catch`.
4. **Selector (`app/products/[slug]/variant-selector.tsx`, create, `"use client"`).** Hold `VariantSelection` in `useState`, initialized from the server-provided `initialSelection`. Render the price (`data-testid="product-price"`, `formatPriceUSD`, tax-exclusive note), a `Size` fieldset of rectangular tiles, a `Color` fieldset of circular swatches with visible color names, and a stock message. Reuse the pure helpers for selectability, labels, price and message. On activation of a selectable option, update state, then `window.history.replaceState(null, "", buildVariantHref(usePathname(), next))` (no navigation request, no scroll jump, no extra history entry). Out-of-stock/unavailable options use `aria-disabled="true"` and a guarded no-op click (they stay focusable so the reason is discoverable), never native `disabled`. Provide one polite live region summarizing the selected variant, price and availability.
5. **Styles (`app/globals.css`, modify).** Add `.product-variant*` rules: zero-radius size tiles (selected = solid ink/ivory), a diagonal hairline slash plus muted text for unavailable tiles, circular swatches with a ring/check for selected and a slash for unavailable, hairline dividers, preserved `:focus-visible` outlines, responsive wrapping at 375px.
6. **Tests.** Add pure UI tests for the helpers and selector, extend the detail DB test for variant ordering/filtering, and update the page test fixture and deep-link cases (scenarios mapped below).

## Expected File Changes

- `db/catalog.ts` — modify; add `ProductDetailVariant`, populate `ProductDetail.variants` (non-discontinued, ordered).
- `app/products/[slug]/variant-selection.ts` — create; pure option/selection/price/message/URL helpers.
- `app/products/[slug]/variant-selector.tsx` — create; client size/color selector, price and stock message.
- `app/products/[slug]/page.tsx` — modify; await `searchParams`, pass variants and initial selection.
- `app/products/[slug]/page.test.tsx` — modify; fixture gains variants, add deep-link/initial-selection coverage.
- `app/products/[slug]/variant-selection.test.ts` — create; pure helper tests (ui project).
- `app/products/[slug]/variant-selector.test.tsx` — create; interaction, disabled-combination and accessibility tests (ui project).
- `db/tests/product-variant-selection.test.ts` — create; variant payload, ordering, discontinued exclusion, override/base price data.
- `app/globals.css` — modify; variant tile/swatch/status styles.
- `feature_list.json` / `PROGRESS.md` — modify at implementation end with verification evidence (implementer, not planner).

No new migration is required.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md` + `stitch_image_based_application/detalle_de_producto_probador_virtual_ia/` (proposal only).
- Screens or states affected: product detail default (no selection), partial selection, selected available variant with base price, selected variant with override, out-of-stock/unavailable option tiles and swatches.
- New design artifact required: no — `DESIGN.md` already defines the size matrix, swatch exception, out-of-stock slash and zero-radius rules.
- Constraints: English copy; Newsreader headings remain unbolded; Hanken Grotesk for option labels and status; hairline borders; no new accent colors; out-of-stock conveyed by slash/text, not color alone; do not render add-to-cart, quantity, try-on, FITIQ or cross-sell.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — note that `/products/[slug]` now exposes storefront-visible variants and that selection is client state mirrored to the query string with `history.replaceState`; add the new route-local modules to the layout listing if that list is maintained.
- `CONSTRAINTS.md`: not needed — the integer-cents rule already covers variant overrides; no new durable MUST/MUST NOT emerges.
- `AGENTS.md`: not needed — startup path, commands and workflow are unchanged.
- Other docs: `docs/domain-model.md` / `CONTEXT.md` already define Variant, stock and price override; no source-of-truth change. No risk-doc change.

## Implementation Plan

1. Extend `ProductDetail`/`getPublishedProductBySlug` with ordered, non-discontinued variants; cover it with the new DB test.
2. Implement and unit-test `variant-selection.ts` (options, selectability, parsing, price, message, URL).
3. Build `variant-selector.tsx` and wire it into `page.tsx` with async `searchParams`; add CSS.
4. Add selector UI tests and update `page.test.tsx` for variants and deep links.
5. Run the full gate and `pnpm build`; record evidence and update durable docs.

## Implementation Tasks

- [ ] Add `ProductDetailVariant` + `variants` to `db/catalog.ts`; filter `discontinued = false`, order by size then color.
- [ ] Write `db/tests/product-variant-selection.test.ts` (payload, ordering, override value, discontinued exclusion, published-only still enforced).
- [ ] Create `variant-selection.ts` with option derivation, parse/normalize, selectability, price, stock message and href builders.
- [ ] Write `variant-selection.test.ts` for the pure model, including out-of-stock and invalid deep-link params.
- [ ] Create `variant-selector.tsx` with labelled groups, `aria-pressed`/`aria-disabled`, live region and `history.replaceState` URL sync.
- [ ] Update `page.tsx` to await `searchParams` and render the selector; keep not-found and DB-failure behavior unchanged.
- [ ] Add `variant-selector.test.tsx` covering selection→price/stock updates, disabled no-ops and accessibility attributes.
- [ ] Update `page.test.tsx` fixture and add initial deep-link coverage.
- [ ] Add `.product-variant*` styles to `app/globals.css`.
- [ ] Update `ARCHITECTURE.md`, then run `./init.sh` and `pnpm build`; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — exit 0, non-blocking install + lint + typecheck + test; it must not start `pnpm dev` or require a database.
- `pnpm test` — new `ui` tests prove option derivation, selection→price/stock updates, disabled combinations, URL parse/build and ARIA state; new `db` test proves variants are returned ordered and non-discontinued with the override intact.
- `pnpm lint` / `pnpm typecheck` — zero errors.
- `pnpm build` — exit 0 without `DATABASE_URL`; `/products/[slug]` stays dynamic.
- Manual (optional, disposable DB): `pnpm db:devdb`, export `DATABASE_URL`, `pnpm db:migrate && pnpm db:seed`, `pnpm dev`, then check `/products/double-breasted-linen-blazer` (M/Ivory `$249.00`, XL/Navy `$229.00`), `/products/longline-wool-overcoat` (Camel S disabled), and a `?size=XL&color=Navy` deep link. Stop all processes afterwards.
- E2E: no persistent browser E2E harness exists in this repo; focused `ui` + `db` coverage is the established surface, so no E2E suite is added.

## Evidence To Capture

- `./init.sh` exit code and test counts, with the new test names.
- `pnpm build` output showing `/products/[slug]` still dynamic.
- Assertions or a short manual transcript showing base vs override price, stock message, disabled combination, deep link and invalid-param normalization.
- Updated `feature_list.json` (`product-variant-selection` status/evidence) and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no add-to-cart, quantity, cart, try-on, fit prediction, cross-sell).
- [ ] Acceptance scenarios 1–7 pass.
- [ ] Options are derived from non-discontinued variants; discontinued rows never reach the storefront.
- [ ] Out-of-stock/unoffered combinations are visibly disabled, announced, and cannot be selected by click or URL.
- [ ] Displayed price uses `priceOverrideCents ?? basePriceCents` as integer cents via `formatPriceUSD`.
- [ ] No schema or migration change was made unnecessarily; `getPublishedProductBySlug` remains published-only.
- [ ] Accessibility: labelled groups, keyboard reachability, `aria-pressed`/`aria-disabled`, live region, no color-only state, visible focus.
- [ ] Durable docs and `feature_list.json` / `PROGRESS.md` were updated correctly.
