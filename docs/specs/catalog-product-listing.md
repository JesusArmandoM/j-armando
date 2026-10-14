# Feature Implementation Spec: Shopper sees a grid of published products

## Source Feature

- `id`: `catalog-product-listing`
- `area`: `catalog`
- `depends_on`: `["bootstrap-database-schema"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide the core catalog browsing experience for shoppers at `/catalog`. The catalog page queries the database through the Drizzle data-access layer for all published products and renders each exactly once in a responsive grid with its primary image, title, and formatted USD price. Draft and archived products are strictly excluded from the display. Each product card links to its detail page at `/products/[slug]`.

## Non-Goals

- Category, size, color, or price filters and sorting (owned by `catalog-filters-and-sort`).
- Keyword search (owned by `catalog-search`).
- Full product detail page rendering, gallery, or try-on (owned by `catalog-product-detail`).
- Add to cart or quick buy actions directly from the grid (owned by `cart-add-item`).
- Pagination or infinite scroll in this initial slice (the demo catalog has 6 published products; pagination arrives with large catalog scaling).

## Job Story

When a shopper visits the catalog,
I want to see a curated grid of available garments with their imagery, names, and prices,
so I can browse the current collection and select items to inspect in detail.

## Acceptance Scenarios

### Scenario 1: Only published products are displayed

Given the database contains seeded products with statuses `published`, `draft`, and `archived`
When a shopper navigates to the catalog page (`/catalog`)
Then all published products appear in the catalog grid
And no draft or archived products appear anywhere in the page HTML.

### Scenario 2: Product card content and layout

Given a published product with a primary image, name, base price, and slug
When the product card renders in the grid
Then the product title is displayed
And the price is formatted in USD (e.g. `$150.00` from `basePriceCents: 15000`)
And the primary product image is rendered with appropriate alt text
And clicking or navigating the card targets `/products/[slug]`.

### Scenario 3: Responsive grid layout

Given the catalog view is rendered on various viewport widths
When viewed on small screens (mobile)
Then the grid displays 1 column
When viewed on medium screens (tablet)
Then the grid displays 2 to 3 columns
When viewed on large screens (desktop)
Then the grid displays 4 columns per the DESIGN.md specifications.

### Scenario 4: Empty catalog state

Given a database with zero published products
When the catalog page is loaded
Then an editorial empty state message is shown without errors.

## Repository Research

- `db/schema/catalog.ts`: Defines `product`, `productImage`, `variant`. `product.status` is `'published' | 'draft' | 'archived'`. `product.basePriceCents` is integer cents in USD.
- `db/catalog.ts`: Provides baseline query functions (`listProductsByStatus`). Needs helper `listPublishedCatalogProducts(db: Db)` that retrieves published products alongside their primary image (position 0 or first image) and category.
- `db/client.ts`: Exposes `getDb()` connecting via `DATABASE_URL`.
- `DESIGN.md`: Specifies typography (Newsreader serif + Hanken Grotesk sans), warm ivory palette, razor-sharp alignment, zero-radius frames, and USD tax-exclusive price display.
- `app/layout.tsx`: Root layout with font definitions and common shell.

## Technical Approach

1. **Data Access Layer (`db/catalog.ts`)**:
   - Add `listPublishedCatalogProducts(db: Db)` returning each published product with its primary image (`position: 0` or lowest position), category name, and formatted price helper.
2. **Catalog Page & Components (`app/catalog/`)**:
   - Server Component `app/catalog/page.tsx` fetching data via `listPublishedCatalogProducts`.
   - Component `ProductCard` rendering image, name, price, and Next.js `Link` to `/products/${slug}`.
   - Grid container with responsive classes: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6`.
   - Editorial header conforming to `DESIGN.md`.
3. **Storefront Navigation**:
   - Add navigation link from landing page / header to `/catalog`.
4. **Verification**:
   - Integration test verifying query filters out draft/archived products and retrieves primary image.
   - Component / page smoke tests verifying rendered HTML, card links, prices, and responsive classes.
   - Run `./init.sh` to ensure lint, typecheck, and tests pass.

## Expected File Changes

- Create: `docs/specs/catalog-product-listing.md`
- Modify: `db/catalog.ts`
- Create: `db/tests/catalog-listing.test.ts`
- Create: `app/catalog/page.tsx`
- Create: `app/catalog/product-card.tsx`
- Create: `app/catalog/page.test.tsx`
- Modify: `app/page.tsx` (add link to catalog)
- Modify: `feature_list.json`
- Modify: `PROGRESS.md`

## Verification Plan

- `pnpm test`: Runs Vitest across `ui` and `db` suites including new catalog listing tests.
- `pnpm lint`: Zero ESLint errors.
- `pnpm typecheck`: Zero TypeScript diagnostics.
- `pnpm build`: Next.js production build completes cleanly.
- `./init.sh`: Baseline gate passes cleanly.
