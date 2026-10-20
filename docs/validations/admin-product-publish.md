# Validation Record: admin-product-publish

## Feature Information

- **Feature ID:** `admin-product-publish`
- **Spec:** `docs/specs/admin-product-publish.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Publishing a draft product makes it appear in storefront catalog and detail
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-publish.test.ts` ("Scenario 1 & 3: Publishing a draft product makes it appear in storefront catalog and detail"):
    - A draft product (`Silk Satin Midi Slip Dress`, base price `$260.00`) is created and initially does not appear in `listPublishedCatalogProducts` and returns `undefined` from `getPublishedProductBySlug`.
    - `updateProductStatus(db, id, 'published')` transitions the status to `published` and updates `updatedAt`.
    - Immediately afterwards, the product appears in `listPublishedCatalogProducts` and `getPublishedProductBySlug` returns the complete product detail (`basePriceCents: 26000`, name, category, etc.).
  - `app/api/admin/products/[id]/status/route.test.ts`:
    - `PATCH /api/admin/products/[id]/status` with `{ status: 'published' }` calls `updateProductStatus` and returns HTTP 200 with `{ ok: true, product }` and `Cache-Control: no-store`.
  - `app/admin/products/[id]/product-status-actions.test.tsx`:
    - Displays "Publish Product" button on a draft product; clicking it fires `PATCH /api/admin/products/[id]/status`, updates the UI status to `published`, and refreshes the router.

### Scenario 2: Archiving a product removes it from catalog and product detail returns 404
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-publish.test.ts` ("Scenario 2: Archiving a published product removes it from catalog and product detail"):
    - An initially published product (`Chunky Alpaca Crewneck Sweater`) is archived via `updateProductStatus(db, id, 'archived')`.
    - It is immediately excluded from `listPublishedCatalogProducts` and `getPublishedProductBySlug` returns `undefined` (which causes `notFound()` in `/products/[slug]`).
    - The product remains visible in the backoffice product list (`listAdminProducts`) with `status: 'archived'`.
  - `app/admin/products/[id]/product-status-actions.test.tsx`:
    - Confirms "Archive Product" button is available in both `draft` and `published` states, and transitions to `archived`.

### Scenario 3: A draft product is never visible in the storefront
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-publish.test.ts` ("Scenario 1 & 3"):
    - Directly asserts that newly created draft products are never returned by `listPublishedCatalogProducts` and `getPublishedProductBySlug` returns `undefined`.
  - `app/admin/products/[id]/product-status-actions.test.tsx`:
    - Renders the disclaimer "Hidden from storefront catalog and product pages (returns 404)" when the product is in `draft` status.

### Scenario 4: Moving an archived product back to draft or published updates storefront visibility accordingly
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-publish.test.ts` ("Scenario 4: Moving an archived product back to published or draft updates visibility accordingly"):
    - Transitions `draft` -> `archived` -> `published` -> `draft`.
    - Moving to `published` restores storefront visibility (`getPublishedProductBySlug` returns the product).
    - Moving to `draft` hides the product again (`getPublishedProductBySlug` returns `undefined`).
  - `app/admin/products/[id]/product-status-actions.test.tsx`:
    - Confirms that in `archived` status, the action controls offer both "Publish Product" and "Revert to Draft".

### Scenario 5: Status transition endpoint enforces admin authentication and authorization
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/api/admin/products/[id]/status/route.test.ts`:
    - Unauthenticated request returns HTTP 401 with `Cache-Control: no-store`.
    - Non-admin authenticated user (role `customer` only) returns HTTP 403 with `Cache-Control: no-store`.
    - Database `updateProductStatus` is never invoked on unauthorized requests.
    - Invalid status value returns HTTP 400 with a clear error message.
    - Non-existent product ID returns HTTP 404 with a clear error message.

---

## Verification Suite Results

- `CI=true ./init.sh`:
  - Dependencies: installed cleanly.
  - Lint: `pnpm lint` passed (0 errors, 0 warnings).
  - Typecheck: `pnpm typecheck` passed (0 errors).
  - Tests: `vitest run` passed across 94 test files / 640 tests (+3 new test files, +12 new tests for `admin-product-publish`).
- `pnpm build`: Next.js 16.4.0 Turbopack production build succeeded, registering `/admin/products/[id]` and `/api/admin/products/[id]/status` as dynamic routes (`ƒ`).

## Conclusion

The feature meets all specifications, architectural boundaries, and constraints. Verdict: **ACCEPT**.
