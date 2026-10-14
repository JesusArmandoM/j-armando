# Feature Implementation Spec: Shopper opens a product detail page

## Source Feature

- `id`: `product-detail-page`
- `area`: `catalog`
- `depends_on`: `["catalog-product-listing"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide the shopper-facing product detail page at `/products/[slug]`. Opening a product from the catalog grid renders that product's image gallery, name, formatted USD price, description, composition and care information, all sourced from the PostgreSQL catalog through the Drizzle data-access layer. Only **published** products are reachable: draft, archived and unknown slugs render the Next.js not-found state (`notFound()`, HTTP 404) instead of an error page.

The route param is the product's public **slug** (matching the `/products/${slug}` links already emitted by `app/catalog/product-card.tsx`), not the internal uuid. Any "product id" phrasing in the feature entry means this public slug.

## Non-Goals

- Size / color variant selection, the selected-variant price and stock message (owned by `product-variant-selection`).
- Add to cart / quantity / buy actions (owned by `guest-cart-add`).
- Virtual try-on photo upload and result (owned by `virtual-tryon-generation`).
- The FITIQ fit predictor and the "Coordinados por Stylist IA" cross-sell module (explicit MVP exclusions; `DESIGN.md`, `docs/mvp-scope.md`).
- Related-products / recommendations, wishlist, reviews, review counts, or AI annotations.
- Catalog filtering, sorting and search (owned by `catalog-filtering` / `catalog-search`).
- Interactive zoom, lightbox, or video hover; a still-image gallery is sufficient for this slice.

## Job Story

When a shopper has found a garment in the catalog,
I want to open it and study its imagery, price, description, fabric composition and care instructions,
so I can decide whether the garment suits me before selecting a size and adding it to the cart.

## Users And Permissions

- Anonymous shopper (guest): can open any published product detail page; no account required.
- Anonymous shopper: cannot reach draft, archived or nonexistent products — those return not-found.
- No authentication, admin gate, or personal data is involved in this feature.

## Acceptance Scenarios

### Scenario 1: Published product renders full detail

Given a published product (e.g. `longline-wool-overcoat`) with images, a base price, description, composition, care and category
When the shopper opens `/products/longline-wool-overcoat`
Then the page shows the product name, the price formatted in USD (e.g. `$349.00` from `basePriceCents: 34900`), the description text, the composition text and the care text
And the image gallery renders the product's images with their alt text.

### Scenario 2: Gallery shows every product image

Given a published product with multiple images at distinct positions
When the detail page renders
Then every image for that product is present in the gallery
And the image with the lowest position is the primary image shown first
And each `<img>` carries the image's `altText`.

### Scenario 3: Unknown slug returns not-found

Given no product exists with slug `does-not-exist`
When the shopper opens `/products/does-not-exist`
Then the route invokes `notFound()` and renders the product not-found state with HTTP 404
And no unhandled error page is shown.

### Scenario 4: Unpublished products are not reachable

Given seeded data containing a draft product (`cropped-tweed-jacket`) and an archived product (`satin-evening-gown`)
When the shopper opens `/products/cropped-tweed-jacket` or `/products/satin-evening-gown`
Then both routes invoke `notFound()` and render the not-found state
And no draft or archived product data appears in the rendered HTML.

### Scenario 5: Catalog navigation reaches the detail page

Given the catalog grid rendered at `/catalog`
When the shopper activates a product card link
Then the navigation target is `/products/[slug]` for that product, matching the route served by this feature.

## Repository Research

### Files Inspected

- `app/catalog/page.tsx` — server component pattern: `export const dynamic = "force-dynamic"`, `getDb()`, `try/catch` graceful fallback, breadcrumb/header markup, `data-testid` conventions.
- `app/catalog/product-card.tsx` — already emits `<Link href={\`/products/${product.slug}\`}>`; no change needed.
- `app/catalog/page.test.tsx` — Vitest `ui` pattern: mocks `@/db/client.ts` (`getDb`), spies on `db/catalog.ts` functions, awaits the async server component and `render()`s the result.
- `db/catalog.ts` — repository: existing `getProductBySlug` (unfiltered by status), `listVariantsByProductId`, `formatPriceUSD(cents)`, `listPublishedCatalogProducts`. No detail query yet.
- `db/schema/catalog.ts` — `product` has `description`, `composition`, `care`, `basePriceCents` (`bigint` cents), `currency`, `status`, `categoryId`; `productImage` has `path`, `altText`, `position` (seed positions start at `1`); `variant` exists but is out of scope here.
- `db/seed-data.ts` — seeded slugs to reuse in tests: published (`longline-wool-overcoat`, `double-breasted-linen-blazer`, `silk-slip-midi-dress`, `merino-crewneck-sweater`, `cotton-poplin-shirt`, `pleated-wool-trousers`), draft (`cropped-tweed-jacket`, `ribbed-knit-cardigan`), archived (`satin-evening-gown`).
- `db/tests/catalog-listing.test.ts`, `db/tests/harness.ts` — `db` project pattern: `createTestDatabase()`, `migrateDatabase()`, `seedCatalog()`, `testDb.drop()`.
- `vitest.config.mts` — `ui` (jsdom, excludes `db/**`) and `db` (node, `db/**/*.test.ts`) projects.
- `app/layout.tsx`, `app/globals.css` — root shell; existing `.catalog*` / `.product-card*` CSS blocks to mirror (serif headings, hairline borders, zero radius).
- `DESIGN.md` — `detalle_de_producto_probador_virtual_ia/` is the reference **proposal** (Spanish/EUR): reuse composition (gallery + commentary column, composition/care block); replace copy with English, prices with USD tax-exclusive, drop try-on and cross-sell.
- `CONSTRAINTS.md` — money is integer cents USD tax-exclusive; migrations are never edited.
- `PROGRESS.md` / `ARCHITECTURE.md` — no persistent browser E2E harness exists; focused UI + integration tests are the established verification surface.

### Existing Patterns To Follow

- Data access is centralized in `db/catalog.ts`; pages never query tables directly.
- Route pages are async server components; dynamic DB routes set `export const dynamic = "force-dynamic"`.
- Prices are always formatted through `formatPriceUSD(cents)`.
- Tests use `data-testid` hooks and mock `@/db/client.ts` at module level.

### Current Gaps

- No `/products/[slug]` route exists.
- No repository function returns a single published product with its images and category.
- No `app/products/[slug]/not-found.tsx` branded not-found state exists (only Next's default).
- No detail-page tests exist.

## Technical Approach

1. **Repository — `db/catalog.ts` (modify).** Add `getPublishedProductBySlug(db, slug)` returning a `ProductDetail` or `undefined`. It filters `product.status = 'published'` and `product.slug = slug`, joins `category`, and loads that product's `product_image` rows ordered by `position` ascending. Do **not** change `getProductBySlug` (keep it status-agnostic; other callers/tests may rely on it). `ProductDetail` includes: `id`, `slug`, `name`, `description`, `composition`, `care`, `basePriceCents`, `currency`, `categoryName`, `categorySlug`, and `images: { path: string; altText: string; position: number }[]`.
2. **Route — `app/products/[slug]/page.tsx` (create).** Async server component; `export const dynamic = "force-dynamic"`. Accept `params: Promise<{ slug: string }>` (Next 16 async params — verify against `node_modules/next/dist/docs/`). Resolve the slug, call `getPublishedProductBySlug`. **Call `notFound()` outside any `try/catch`** so the thrown not-found signal is not swallowed. Structure: `try { product = await query } catch (e) { console.error(...); }` then `if (!product) notFound();`. Add `generateMetadata()` returning the product name as the page title (and a category-aware breadcrumb). Render: breadcrumb (`J. Armando` → `/catalog` → product name), the gallery, and a commentary column with name, `formatPriceUSD(basePriceCents)` labelled tax-exclusive, description, and a composition/care block.
3. **Gallery — `app/products/[slug]/product-gallery.tsx` (create).** Client component (`"use client"`) holding a selected-index state: a primary image plus the remaining images as clickable thumbnails; clicking a thumbnail swaps the primary. Each `<img>` uses the image's `altText`. When the product has no images, render a zero-radius placeholder with the product name as alt text (catalog already falls back to `/images/placeholder.svg`). Use `next/image` with `unoptimized` to match `product-card.tsx`.
4. **Not-found — `app/products/[slug]/not-found.tsx` (create).** Zero-radius editorial not-found state ("This garment is no longer available") with a link back to `/catalog`, English copy, per `DESIGN.md`.
5. **Styles — `app/globals.css` (modify).** Add a `.product-detail*` / `.product-gallery*` block mirroring the catalog conventions: serif heading, stone metadata, hairline dividers, zero radius, responsive single-column stack on mobile and an asymmetric imagery/commentary split on desktop.
6. **Tests.** `db/tests/product-detail.test.ts` (integration over embedded PostgreSQL) and `app/products/[slug]/page.test.tsx` (jsdom, mocked repository) covering the acceptance scenarios.

## Expected File Changes

- `db/catalog.ts` — modify; add `getPublishedProductBySlug` and the `ProductDetail` type (reuse `formatPriceUSD`).
- `app/products/[slug]/page.tsx` — create; detail route server component.
- `app/products/[slug]/product-gallery.tsx` — create; client image gallery component.
- `app/products/[slug]/not-found.tsx` — create; branded not-found state for the segment.
- `app/products/[slug]/page.test.tsx` — create; UI tests for scenarios 1, 2, 3.
- `db/tests/product-detail.test.ts` — create; repository integration tests for scenarios 1, 3, 4.
- `app/globals.css` — modify; product detail + gallery styles.
- `docs/specs/product-detail-page.md` — create (this file).
- `feature_list.json` — modify; record verification evidence and status at implementation end (implementer, not planner).
- `PROGRESS.md` — modify; session log + verified state.

No new DB migration is required: every column the page reads already exists.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` + `stitch_image_based_application/detalle_de_producto_probador_virtual_ia/` (reference only)
- Screens or states affected: product detail (published, multi-image, single-image, no-image), product not-found.
- New design artifact required: no — the reference and `DESIGN.md` cover the composition; the not-found state uses the existing editorial language.
- Constraints: Newsreader serif headings (no bold), Hanken Grotesk body, warm ivory palette, hairline borders, **zero border radius**, English copy, USD tax-exclusive price with a visible "tax-exclusive / tax calculated at checkout" note. The gallery `<img>` must carry meaningful alt text. Do **not** render the FITIQ fit predictor, the AI Stylist cross-sell module, size/color tiles, or add-to-cart controls.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — add `/products/[slug]` to the runtime surface / route list (the doc enumerates the App Router surface) and note it is public and read-only.
- `CONSTRAINTS.md`: not needed — no new durable MUST/MUST NOT rule; money-as-cents and migration rules already apply.
- `AGENTS.md`: not needed — startup path, commands and workflow are unchanged.
- Other docs: none — `DESIGN.md` and `docs/domain-model.md` already describe the detail screen and the published/draft/archived lifecycle; no source of truth changes.

## Implementation Plan

1. Add `ProductDetail` + `getPublishedProductBySlug` to `db/catalog.ts` (published-only filter, images ordered by position) and cover it with `db/tests/product-detail.test.ts`.
2. Create `app/products/[slug]/page.tsx` (async server component, `force-dynamic`, `notFound()` outside `try/catch`) and `app/products/[slug]/not-found.tsx`.
3. Create `app/products/[slug]/product-gallery.tsx` and add the detail/gallery CSS to `app/globals.css`.
4. Add `app/products/[slug]/page.test.tsx` covering render, gallery and not-found.
5. Run the full gate (`./init.sh`, `pnpm build`), then record evidence in `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Add `getPublishedProductBySlug` + `ProductDetail` to `db/catalog.ts`; keep `getProductBySlug` unchanged.
- [ ] Write `db/tests/product-detail.test.ts` (published full detail, images sorted, draft → undefined, archived → undefined, unknown → undefined).
- [ ] Create `app/products/[slug]/page.tsx` with `force-dynamic`, async `params`, and `notFound()` for missing/unpublished products.
- [ ] Create `app/products/[slug]/product-gallery.tsx` with thumbnail selection and alt-text handling.
- [ ] Create `app/products/[slug]/not-found.tsx` with a link back to `/catalog`.
- [ ] Add detail/gallery styles to `app/globals.css` (serif heading, hairline borders, zero radius, responsive split).
- [ ] Write `app/products/[slug]/page.test.tsx` (mocked `@/db/client.ts`; assert name/price/description/composition/care, all gallery images, and `notFound()` for an unknown slug).
- [ ] Run `./init.sh` and `pnpm build`; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — must execute the standard non-blocking gate (install + lint + typecheck + test) and exit 0; it must not start `pnpm dev`. New `ui` and `db` tests must be included and pass.
- `pnpm test` — `db/tests/product-detail.test.ts` proves the repository returns full detail for a published product, orders images by position, and returns `undefined` for draft, archived and unknown slugs; `app/products/[slug]/page.test.tsx` proves the page renders name, USD price, description, composition, care and every gallery image, and calls `notFound()` when the repository returns `undefined`.
- `pnpm lint` / `pnpm typecheck` — zero errors.
- `pnpm build` — production build exits 0. Because the route is `force-dynamic`, the build must not require `DATABASE_URL`.
- Manual (optional, disposable DB): `pnpm db:devdb`, export the printed `DATABASE_URL`, `pnpm db:migrate && pnpm db:seed`, then `pnpm dev` and open `/products/longline-wool-overcoat` (full detail), `/products/cropped-tweed-jacket` and `/products/satin-evening-gown` (404), `/products/no-such-slug` (404). Stop the dev server afterwards.
- E2E: no persistent browser E2E harness exists (`PROGRESS.md`, `ARCHITECTURE.md`). Focused `db` integration tests plus `ui` component/page tests are the repo's established verification surface for this route, so no E2E suite is added here.

## Evidence To Capture

- `./init.sh` output (exit 0) and `pnpm test` counts, including the new `db` and `ui` test names.
- `pnpm build` output showing the dynamic `/products/[slug]` route compiled.
- A short manual transcript (or test assertions) showing a published slug renders and draft/archived/unknown slugs hit not-found.
- Update `feature_list.json` (`product-detail-page` verification + evidence) and `PROGRESS.md` (current verified state / session log).

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no variant selection, cart, try-on, fit predictor or cross-sell).
- [ ] Acceptance scenarios 1–5 pass.
- [ ] `db/catalog.ts` exposes `getPublishedProductBySlug`; `getProductBySlug` was not changed.
- [ ] Draft, archived and unknown slugs render the not-found state (HTTP 404), not an error page.
- [ ] Price is rendered as USD tax-exclusive via `formatPriceUSD`; no float money introduced.
- [ ] No migration files were edited or added unnecessarily.
- [ ] Verification evidence is present and `feature_list.json` / `PROGRESS.md` were updated correctly.
- [ ] No unrelated product behavior or extra feature work was added.
