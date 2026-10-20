# Feature Implementation Spec: Admin publishes and archives products

## Source Feature

- `id`: `admin-product-publish`
- `area`: `backoffice`
- `depends_on`: `["admin-product-create"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Enable an authenticated administrator to move any catalog product between its lifecycle statuses (`draft`, `published`, and `archived`), and ensure that only `published` products appear in the storefront catalog (`/catalog`) and product detail page (`/products/[slug]`). Archiving or reverting a product to draft immediately hides it from the storefront catalog and makes its detail page return HTTP 404 (via Next.js `notFound()`).

## Architecture & Implementation

1. **Backoffice Product Repository (`db/admin-products.ts`):**
   - Add `updateProductStatus(db, productId, newStatus)`:
     - Validates UUID syntax.
     - Validates that `newStatus` is one of `'draft' | 'published' | 'archived'`.
     - Updates `product.status` and `product.updatedAt = new Date()`.
     - Returns the updated `AdminProductDetail` via `getAdminProductById(db, productId)`, or `null` if the product is not found.
2. **Admin Product Status Route Handler (`app/api/admin/products/[id]/status/route.ts`):**
   - Guarded by `getAdminSession()`.
   - Returns HTTP 401 when unauthenticated.
   - Returns HTTP 403 when authenticated but lacking the `admin` role.
   - Accepts both `PATCH` and `POST` requests with JSON body `{ status: 'draft' | 'published' | 'archived' }`.
   - Returns HTTP 400 with a descriptive error if the payload is malformed or status is invalid.
   - Returns HTTP 404 if the product ID does not exist in the database.
   - Revalidates relevant Next.js paths (`/admin/products`, `/admin/products/${id}`, `/catalog`, `/products/${product.slug}`).
   - Returns HTTP 200 `{ ok: true, product }` with `Cache-Control: no-store`.
3. **Backoffice UI (`app/admin/products/[id]/product-status-actions.tsx` & `app/admin/products/[id]/page.tsx`):**
   - Renders lifecycle transition action controls for the product.
   - When status is `draft`: allows "Publish Product" and "Archive Product".
   - When status is `published`: allows "Archive Product" and "Revert to Draft".
   - When status is `archived`: allows "Publish Product" and "Revert to Draft".
   - Client component handles pending/loading state, optimistic/live status update, error messaging, and triggers Next.js router refresh.
   - Product list (`/admin/products`) and product detail (`/admin/products/[id]`) display the updated status badge.
   - Styles added to `app/globals.css` using `admin-product-publish-` namespace.
4. **Storefront Isolation Guarantee:**
   - Storefront catalog listing (`listPublishedCatalogProducts` / `listCatalogProducts`) queries exclusively `where(eq(product.status, "published"))`.
   - Storefront product detail (`/products/[slug]`) calls `getPublishedProductBySlug(db, slug)` which enforces `eq(product.status, "published")` and triggers `notFound()` (HTTP 404) for `draft` and `archived` products.
   - Moving from `draft` to `published` immediately exposes the product to the storefront; moving from `published` to `archived` or `draft` immediately hides it.

## Acceptance Scenarios

### Scenario 1: Publishing a draft product makes it appear in storefront catalog and detail
Given a product created in `draft` status
When an authenticated admin publishes the product via backoffice action or `PATCH /api/admin/products/[id]/status`
Then the product status becomes `published`, it appears in `listCatalogProducts` / `/catalog`, and its detail URL `/products/[slug]` returns HTTP 200 with complete garment details and images.

### Scenario 2: Archiving a product removes it from catalog and product detail returns 404
Given a product currently in `published` status
When an authenticated admin archives the product
Then the product status becomes `archived`, it is omitted from `listCatalogProducts` / `/catalog`, and accessing `/products/[slug]` returns HTTP 404 (`notFound()`).

### Scenario 3: A draft product is never visible in the storefront
Given a product in `draft` status
When visitors view `/catalog` or navigate to `/products/[slug]`
Then the draft product is omitted from the catalog listing and `/products/[slug]` returns HTTP 404.

### Scenario 4: Moving an archived product back to draft or published updates storefront visibility accordingly
Given a product in `archived` status
When an authenticated admin moves it back to `published`
Then it reappears in storefront catalog and detail;
When an admin moves it to `draft`
Then it remains hidden from storefront catalog and detail.

### Scenario 5: Status transition endpoint enforces admin authentication and authorization
Given an unauthenticated visitor or an authenticated user with only the `customer` role
When attempting `PATCH` or `POST /api/admin/products/[id]/status`
Then the endpoint returns HTTP 401 (unauthenticated) or HTTP 403 (forbidden), and the product status in the database remains unchanged.
