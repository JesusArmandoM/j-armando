# Feature Implementation Spec: Shopper narrows and orders the catalog listing

## Source Feature

- `id`: `catalog-filtering`
- `area`: `catalog`
- `depends_on`: `["catalog-product-listing"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`
- `notes` (from feature list): filters must be reflected in the URL so results are shareable and back/forward works.

## Goal

Extend the accepted `/catalog` listing so a shopper can narrow it by **category, size, color and a maximum price**, and order it by **newest, price ascending, price descending or name**. The result count always reflects the current result set, and a reset affordance restores the unfiltered, default-sorted listing.

All filter and sort state lives in the URL query string, so any filtered view is shareable and the browser back/forward buttons move between filter states without a client-side store. The list continues to show only `published` products, exactly once, with their primary image, name and USD price (unchanged from `catalog-product-listing`).

## Non-Goals

- Keyword search (owned by a later search feature).
- Multi-select facets (one value per facet only) and multi-category browsing.
- A minimum-price filter, price range slider, or arbitrary numeric price entry (a fixed set of max-price presets ships here).
- Pagination, infinite scroll, or server-side result caps (the demo catalog has 6 published products; without a pagination boundary the result count equals the full filtered set).
- Category/collection merchandising beyond the existing structural category axis; no collections/capsules filter.
- Size/color availability hints on product cards (deferred; this feature only filters).
- Reworking the product detail page, gallery or variant selection (owned by `product-detail-page` / `product-variant-selection`).
- A mobile filter drawer (DESIGN.md suggests one; a responsive wrapping toolbar is enough for this slice).
- Persisting filter preference per user, or a client state store (the URL is the only state).

## Job Story

When I am browsing the catalog,
I want to narrow the garments by category, size, color and price and reorder them by recency, price or name,
so I can find a garment that fits my intent quickly, and share or bookmark the exact view I found.

## Users And Permissions

- **Guest**: can use every filter, sort and reset control on `/catalog` and share the resulting URL. No authentication involved.
- **Customer**: same as guest (no account-specific behavior here).
- **Admin**: same as guest on the storefront. Draft and archived products stay invisible to every actor.

## Acceptance Scenarios

### Scenario 1: Filter by a single facet (category, size, color, max price)

Given the seeded catalog has 6 published products across the 6 categories
When the shopper selects a filter value (URL query gains `category=<slug>`, or `size=<XS|S|M|L|XL>`, or `color=<name>`, or `maxPrice=<dollars>`)
Then only published products matching that value render
And no draft (`cropped-tweed-jacket`, `ribbed-knit-cardigan`) or archived (`satin-evening-gown`) product appears
And the result count equals the number of matching products.
Deterministic seed expectations: `category=coats` → 1; `size=L` → 5; `color=Navy` → 1; `maxPrice=150` → 2.

### Scenario 2: Size and color match non-discontinued variants

Given a published product has variants
When the shopper filters by size and/or color
Then a product matches a size only if it has a **non-discontinued** variant of that size
And matches a color only if it has a **non-discontinued** variant of that color
And out-of-stock variants still count as matches (availability, not stock, decides visibility)
And the two facets are matched **independently** (a product may match size and color through different variants).

### Scenario 3: Facets combine with AND

Given more than one facet is set
When the shopper applies `category=blazers` and `size=M` (URL `/catalog?category=blazers&size=M`)
Then only published blazers that have a non-discontinued size-M variant render
And every additional facet narrows the set further.
Seed expectation: `category=blazers&size=M` → 1 (Double-Breasted Linen Blazer).

### Scenario 4: Sort options reorder the result set

Given the filtered (or unfiltered) published set
When the shopper picks `sort=newest` / `sort=price-asc` / `sort=price-desc` / `sort=name`
Then the grid is ordered by product `createdAt` descending / base price ascending / base price descending / name ascending respectively
And ties are broken by name ascending so ordering is deterministic
And the default (no `sort` param, or an invalid value) is `newest`.
Seed `price-asc` expectation: Cotton Poplin Shirt, Merino Crewneck Sweater, Pleated Wool Trousers, Silk Slip Midi Dress, Double-Breasted Linen Blazer, Longline Wool Overcoat.

### Scenario 5: Result count reflects the current set

Given any combination of filters and sort
When the page renders
Then a results count element shows the number of matching published products (singular "1 garment", plural "N garments")
And the count changes when a filter changes.

### Scenario 6: Reset restores the unfiltered, default-sorted listing

Given at least one filter or a non-default sort is active
When the shopper activates the "Reset" control
Then the URL becomes `/catalog` (no query params)
And every published product renders in the default (`newest`) order
And the reset control is not shown when no filter or sort is active.

### Scenario 7: Filters are shareable and back/forward navigates states

Given a shopper has applied filters (the address bar holds the query string)
When the URL is opened in a new session, or the browser Back/Forward buttons are used
Then the same filtered, ordered listing renders for that URL
And changing a control pushes a new history entry rather than replacing it.

### Scenario 8: No-match and invalid-parameter states

Given an active filter combination matches no published product
When the catalog renders
Then a distinct "no matching garments" empty state with a reset affordance is shown (not the catalog-empty state)
And an unknown/invalid `sort` falls back to `newest`, and a non-numeric or non-positive `maxPrice` is ignored.

### Scenario 9: Draft/archived exclusion holds under every filter

Given draft and archived products exist
When any filter or sort is applied
Then draft and archived products never appear in the grid or the count.

## Repository Research

### Files Inspected

- `db/catalog.ts` — existing repository: `listPublishedCatalogProducts(db)` (published join category, primary image via lowest `position`), `formatPriceUSD`, `VariantAvailability`. Extend here.
- `db/schema/catalog.ts` — `product` (`status`, `basePriceCents` bigint, `createdAt`), `category` (`slug`, `name`, `sortOrder`), `variant` (`size` enum, `color` text, `colorHex`, `discontinued`, `stockQty`, `priceOverrideCents`), `productImage` (`position`).
- `db/schema/enums.ts` — `variantSize` = `["XS","S","M","L","XL"]`, `productStatus` = `["draft","published","archived"]`.
- `db/seed-data.ts` — 6 categories, 9 products (6 published), 40 variants, 16 images; sizes XS–XL, colors incl. "Sky Blue"/"Navy"; base prices $89–$349 (integer cents).
- `db/seed.ts` — `seedCatalog(db)` insert-if-missing; safe to call from tests.
- `db/tests/catalog-listing.test.ts` — existing DB integration test pattern (`createTestDatabase` + `migrateDatabase` + `seedCatalog`).
- `app/catalog/page.tsx` — Server Component, `export const dynamic = "force-dynamic"`, try/catch around `getDb()` + query, grid/empty/footer.
- `app/catalog/product-card.tsx` — card renderer (image, category, title, `formatPriceUSD`).
- `app/catalog/page.test.tsx` — UI test pattern: `vi.mock("@/db/client.ts")` and `vi.spyOn` on the query, `await CatalogPage()` then `render(ui)`.
- `app/globals.css` — design tokens + `.catalog__*` / `.product-card__*` styles, responsive grid.
- `vitest.config.mts` — `ui` (jsdom) and `db` (node) projects; `@` alias to repo root.
- `ARCHITECTURE.md` — data layer, layering intent, no browser E2E harness yet.
- `CONSTRAINTS.md` — money as integer cents; self-contained tests (embedded PostgreSQL 17).

### Existing Patterns To Follow

- Read through the Drizzle repository in `db/catalog.ts`; never query tables from React.
- Server Component owns data fetching; keep `export const dynamic = "force-dynamic"` (the query depends on `searchParams` and live data).
- Tests split by project: DB behavior in `db/tests/*.test.ts` against the ephemeral embedded PostgreSQL; UI in `*.test.tsx`/`*.test.ts` under jsdom.
- Money stays integer cents; convert to USD only at the display/URL boundary.
- UI copy in English, USD, tax-exclusive; zero-radius editorial styling per `DESIGN.md`.

### Current Gaps

- No URL/searchParams plumbing on `/catalog` yet.
- No filter/sort query in the repository; `listPublishedCatalogProducts` has no parameters.
- No data-access function returning the facet options (categories/sizes/colors) present in the published catalog.
- No browser E2E harness (`ARCHITECTURE.md` → "Browser E2E: not present"), so acceptance relies on DB + UI Vitest tests plus a manual `pnpm dev` check.
- Next.js 16 `searchParams` is an async prop; the implementer must confirm the current signature in `node_modules/next/dist/docs/` before coding (see `ARCHITECTURE.md` → "Next.js 16 has breaking changes").

## Technical Approach

### URL query-param model

Single-select facets, canonical param names and value domains:

| Param | Domain | Meaning | Default |
| --- | --- | --- | --- |
| `category` | category `slug` (e.g. `coats`) | restrict to one category | absent |
| `size` | `XS` \| `S` \| `M` \| `L` \| `XL` | product has a non-discontinued variant of this size | absent |
| `color` | variant `color` string, URL-encoded (e.g. `Sky%20Blue`) | product has a non-discontinued variant of this color | absent |
| `maxPrice` | positive integer = whole USD dollars | `basePriceCents <= maxPrice * 100` | absent |
| `sort` | `newest` \| `price-asc` \| `price-desc` \| `name` | ordering key | `newest` |

Add `app/catalog/filter-params.ts` with pure helpers (no React, no DB):

- `CATALOG_SORTS` (const tuple) and `CatalogSort` type.
- `CatalogFilters` interface `{ category?: string; size?: VariantSize; color?: string; maxPrice?: number; sort: CatalogSort }`.
- `parseCatalogSearchParams(input: Record<string, string | string[] | undefined>): CatalogFilters` — takes the first value of array params; accepts only valid enum `size`; ignores a non-integer or `<= 0` `maxPrice`; unknown `sort` falls back to `newest`; trims values. Unknown `category`/`color` strings are kept and simply match nothing (the UI only ever emits known values).
- `buildCatalogQuery(filters: CatalogFilters): string` — emits only non-default params via `URLSearchParams` in a fixed order (`category`, `size`, `color`, `maxPrice`, `sort`), returns `""` when everything is default; used to build `/catalog${query}`.
- `hasActiveFilters(filters: CatalogFilters): boolean` — true if any facet is set or `sort !== "newest"`.

### Data-access query changes (`db/catalog.ts`)

- Extend `listPublishedCatalogProducts(db, filters: CatalogFilters = {})` (keep the existing call shape working for current tests). Filter predicates:
  - category: `eq(category.slug, filters.category)`.
  - size: `inArray(product.id, db.select({ id: variant.productId }).from(variant).where(and(eq(variant.size, size), eq(variant.discontinued, false))))`.
  - color: same correlated subquery with `eq(variant.color, color)`.
  - max price: `lte(product.basePriceCents, maxPrice * 100)`.
  - Always keep `eq(product.status, "published")`.
  - Facets combine with `and(...)`; size and color are independent EXISTS-style subqueries.
- Ordering:
  - `newest`: `desc(product.createdAt), asc(product.name)`.
  - `price-asc`: `asc(product.basePriceCents), asc(product.name)`.
  - `price-desc`: `desc(product.basePriceCents), asc(product.name)`.
  - `name`: `asc(product.name)`.
  - Replace the current `category.sortOrder, product.name` default (catalog-product-listing asserts set membership, not order, so this is safe).
- Keep the existing primary-image fetch (`inArray(productImage.productId, ids)`, lowest `position`).
- Result count is `products.length`; no extra count query while there is no pagination.
- Add `listPublishedCatalogFilterOptions(db)` returning `{ categories: { slug, name }[]; sizes: VariantSize[]; colors: string[] }`, derived from **published, non-discontinued** data so no option yields an empty set:
  - categories: distinct categories joined to published products, ordered by `category.sortOrder`.
  - sizes: distinct `variant.size` (enum ordering XS→XL) over published, non-discontinued variants.
  - colors: distinct `variant.color` over published, non-discontinued variants, ordered ascending.
- Price sort/filter uses the product **base price** (the value the card displays). Variant `priceOverrideCents` is intentionally not used for listing order/limit in this slice.

### Server/client component approach

- `app/catalog/page.tsx` — async Server Component. `await searchParams`, `parseCatalogSearchParams(...)`, then (inside the existing try/catch) `listPublishedCatalogProducts(db, filters)` + `listPublishedCatalogFilterOptions(db)`. On DB error, log and fall back to `products = []` and empty options (page still renders). Render: header (unchanged), `FilterBar` (client) with `options` + `current={filters}`, results count, grid, filtered-empty vs catalog-empty state, footer.
- `app/catalog/filter-bar.tsx` — `"use client"`. Receives `options` and `current` as props (no `useSearchParams`), so the server remains the source of truth and no Suspense boundary is needed. Renders labeled native `<select>` controls for Category, Size, Color, Max price and Sort, plus a Reset link to `/catalog`. Each `<select>` `value` is the current filter, `onChange` computes `buildCatalogQuery({ ...current, [field]: value || undefined })` and calls `router.push(`/catalog${query}`, { scroll: false })` (new history entry → back/forward works). The Reset link is rendered only when `hasActiveFilters(current)`.
- Reuse existing `.catalog__*` grid/empty/footer markup; add filter/results styles to `app/globals.css`.

### Sort semantics

`newest` = `createdAt` desc (tie-break name asc); `price-asc`/`price-desc` = base price asc/desc (tie-break name asc); `name` = name asc. Absent or invalid sort resolves to `newest`. Newest ordering is only meaningfully testable with controlled `createdAt`, so the DB test inserts products with explicit timestamps rather than relying on seed insert order.

### Reset behavior

Reset clears every facet **and** the sort back to defaults by navigating to `/catalog`. It is shown only when `hasActiveFilters(current)` is true.

## Expected File Changes

- `app/catalog/filter-params.ts` — create; pure parse/build/has-active helpers + types.
- `app/catalog/filter-bar.tsx` — create; client filter/sort/reset control bar.
- `app/catalog/page.tsx` — modify; read `searchParams`, fetch filtered data + options, render controls, count and states.
- `app/catalog/page.test.tsx` — modify; update mocks for the new query/options functions and assert count/filtered rendering/empty states.
- `app/catalog/filter-params.test.ts` — create; pure helper unit tests (ui project).
- `app/catalog/filter-bar.test.tsx` — create; render/branch tests with a mocked `next/navigation` router (ui project).
- `db/catalog.ts` — modify; filtering/ordering params + `listPublishedCatalogFilterOptions` + exported filter types.
- `db/tests/catalog-filtering.test.ts` — create; DB integration tests for each facet, combination, sort, exclusion and options.
- `app/globals.css` — modify; filter bar, results count and filtered-empty styles (zero radius).
- `docs/specs/catalog-filtering.md` — this spec.
- `feature_list.json`, `PROGRESS.md` — modify; status/evidence and session log.
- `ARCHITECTURE.md` — optional/minor: refresh the Status paragraph and note the catalog route now uses URL query-param filtering; no layer or boundary change.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md` (reference asset `stitch_image_based_application/cat_logo_colecci_n_editorial/` — the filter + "Ordenar" row in English, USD).
- Screens/states affected: `/catalog` gains a filter/sort toolbar, a results-count row, and a second "no matching garments" empty state; the grid, product cards and catalog-empty state are unchanged.
- Rules: zero radius everywhere; hairline borders; uppercase micro-labels; native selects styled with the flat bottom-border input treatment; responsive wrapping toolbar (stacked/scrollable on mobile) per DESIGN.md; keyboard operable and visible focus; do not rely on color alone. A full mobile drawer is out of scope.
- Copy: labels "Category", "Size", "Color", "Max price", "Sort", "Reset"; sort labels "Newest", "Price: Low to High", "Price: High to Low", "Name: A–Z"; count "N garments"/"1 garment". All English, prices USD.
- New design artifact required: no — composed from the existing system.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update (minor) — refresh the "no product behavior" Status line and state that catalog listing state lives in URL query params; no new domain/layer/boundary.
- `CONSTRAINTS.md`: not needed — money-as-integer-cents and test-self-containment already govern this feature; the URL-state rule is product behavior, not a new durable MUST.
- `AGENTS.md`: not needed — no change to workflow, startup path or commands.
- Other docs: none — `CONTEXT.md`, `docs/domain-model.md` and `docs/mvp-scope.md` already describe catalog filters and sorting.

## Implementation Plan

1. Confirm the Next.js 16 `searchParams` prop signature and `next/navigation` client APIs in `node_modules/next/dist/docs/`.
2. Add filter/ordering support and `listPublishedCatalogFilterOptions` to `db/catalog.ts`; add `CatalogFilters`/`CatalogSort` types.
3. Write `db/tests/catalog-filtering.test.ts` (each facet, combination, sorts, exclusion, options) and get the `db` project green.
4. Write `app/catalog/filter-params.ts` and its unit tests.
5. Write `app/catalog/filter-bar.tsx` and its UI tests (mocked router).
6. Rework `app/catalog/page.tsx` to parse `searchParams`, fetch filtered data + options, render the toolbar/count/states; update `app/catalog/page.test.tsx`.
7. Add styles to `app/globals.css`; run lint, typecheck, test, build and `./init.sh`; do a manual `pnpm dev` (and optional `pnpm db:devdb` + `db:seed`) URL/count/back-forward check.
8. Update `feature_list.json`, `PROGRESS.md` and the minor `ARCHITECTURE.md` note.

## Implementation Tasks

- [ ] Confirm Next 16 `searchParams` / `next/navigation` signatures in `node_modules/next/dist/docs/`.
- [ ] Add `CatalogSort`, `CatalogFilters` and ordering/filter predicates to `db/catalog.ts`.
- [ ] Add `listPublishedCatalogFilterOptions(db)` (categories/sizes/colors over published, non-discontinued data).
- [ ] Write `db/tests/catalog-filtering.test.ts`: category, size, color, maxPrice, combined facets, four sorts (controlled `createdAt` for newest), draft/archived exclusion, and options.
- [ ] Write `app/catalog/filter-params.ts` (parse/build/hasActive) and `app/catalog/filter-params.test.ts`.
- [ ] Write `app/catalog/filter-bar.tsx` (labeled selects + reset, `router.push`) and `app/catalog/filter-bar.test.tsx` with a mocked `next/navigation`.
- [ ] Rework `app/catalog/page.tsx` to use `searchParams`, options and filtered products; render count, filtered-empty and catalog-empty states.
- [ ] Update `app/catalog/page.test.tsx` for the new data functions and assert count/filtered/empty states.
- [ ] Add filter/results/filtered-empty styles to `app/globals.css` (zero radius, responsive).
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `./init.sh`.
- [ ] Manual check: `pnpm dev` and request `/catalog?category=coats&sort=price-asc`, `/catalog?size=L&maxPrice=150`, `/catalog?sort=bogus`; confirm count/order and that back/forward moves between states.
- [ ] Update `feature_list.json` (verification + evidence), `PROGRESS.md`, and the minor `ARCHITECTURE.md` note.

## Verification Plan

- `pnpm test`: `db` project runs `db/tests/catalog-filtering.test.ts` against the ephemeral embedded PostgreSQL 17 (seeded via `seedCatalog`; newest ordering uses explicitly timestamped rows); `ui` project runs `filter-params.test.ts`, `filter-bar.test.tsx` and the updated `page.test.tsx`.
- `pnpm lint` and `pnpm typecheck`: zero errors.
- `pnpm build`: Next.js production build includes the dynamic `/catalog` route.
- `./init.sh`: executes the non-blocking gate (install + lint + typecheck + test) and exits 0; must not start `pnpm dev`; may print the manual follow-up commands.
- Manual (recorded transcript): `pnpm db:devdb` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`; `curl` the URLs in Scenario 1/3/4 with `?` params and confirm the rendered product set, order and count; verify Reset returns `/catalog`; confirm browser Back/Forward restores prior query states.
- Persistent E2E: no browser E2E harness exists in this repo (`ARCHITECTURE.md` → "Browser E2E: not present"). Do not invent one here; DB integration + UI component/unit tests plus the manual URL transcript are sufficient and are the repo's current convention. (A harness remains a follow-up when a feature introduces it.)

## Evidence To Capture

- `pnpm test` summary with the new `db` and `ui` test names, and `./init.sh` exit 0 (once).
- `pnpm build` exit 0 and the generated `/catalog` route line.
- Manual transcript: the exact `curl`/browser URLs and the observed product sets, counts and order for category, size, color, max-price, combined facets, each sort, reset and an invalid `sort`.
- The DB test names that assert each facet and each sort, plus the options test.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no search, no multi-select, no pagination, no card availability hints).
- [ ] All acceptance scenarios pass, including draft/archived exclusion under filters and the filtered-empty vs catalog-empty distinction.
- [ ] Filters and sort are fully URL-driven; reset navigates to `/catalog`; back/forward works (manual transcript).
- [ ] Result count matches the rendered set (singular/plural).
- [ ] `./init.sh` exits 0; `pnpm build` succeeds; money handling stays integer cents.
- [ ] Tests are self-contained (no Docker/system PostgreSQL) and split correctly across `ui`/`db`.
- [ ] `feature_list.json` and `PROGRESS.md` updated with evidence; `ARCHITECTURE.md` minor note applied.
- [ ] No unrelated product behavior or extra feature work added.
