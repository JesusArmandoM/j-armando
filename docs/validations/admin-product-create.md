# Validation Record: admin-product-create

## Feature Information

- **Feature ID:** `admin-product-create`
- **Spec:** `docs/specs/admin-product-create.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Creating a product with two variants and stock persists and is listed in the backoffice
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-create.test.ts` ("Scenario 1: Creating a product with two variants and stock persists as draft and is listed in the backoffice"):
    - Creates a product (`Double-Faced Cashmere Wrap Coat`, `$495.00` -> `49500` integer cents) with two variants (`S / Camel` stock `12` and `M / Camel` stock `8`).
    - Persists in `draft` status, appears in `listAdminProducts` with `variantCount: 2` and `totalStock: 20`, and does not leak into storefront `listPublishedCatalogProducts` or `getPublishedProductBySlug`.
  - `app/admin/products/new/create-product-form.test.tsx`:
    - Admin fills product fields, adds a second variant row, sets per-variant stock (`12` and `8`), submits to `POST /api/admin/products`, and navigates to `/admin/products/[id]`.
  - `app/admin/products/page.test.tsx`:
    - Verifies both `/admin/products` list row and `/admin/products/[id]` detail view render the saved product, `draft` badge, `$495.00` price, and both variants.

### Scenario 2: Stock is stored per variant, not per product
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-product-create.test.ts` ("Scenario 2: Stock is stored per variant, not per product"):
    - Creates a product with three variants having distinct stock quantities (`XS / Ivory` stock `15`, `M / Obsidian` stock `0`, `L / Obsidian` stock `7`).
    - `getAdminProductById` returns each variant with its own `stockQty` (`15`, `0`, `7`), while the `product` table stores no product-level stock column.
  - `app/admin/products/page.test.tsx`:
    - Asserts `variant-stock-S-Camel` (`12 in stock`) and `variant-stock-M-Camel` (`8 in stock`) in the variant inventory table.

### Scenario 3: Invalid input is rejected with a clear message
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/admin/products/product-input.test.ts` (7 unit tests):
    - Rejects missing required fields, zero/negative/malformed dollar strings, empty variant arrays, invalid sizes (`XXL`), duplicate `(size, color)` pairs (case-insensitive), and negative stock with clear field errors.
  - `db/tests/admin-product-create.test.ts` ("Scenario 3: Invalid input is rejected with a clear message and writes no database rows"):
    - Rejects negative stock, duplicate variants, and non-existent category IDs without writing any product or variant rows.
  - `app/api/admin/products/route.test.ts` & `app/admin/products/new/create-product-form.test.tsx`:
    - API returns HTTP 400 with `{ ok: false, error, fieldErrors }`; form renders `role="alert"` (`data-testid="create-product-error"`) with the clear message.

### Scenario 4: Backoffice product routes and API enforce the admin role gate
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/api/admin/products/route.test.ts`:
    - Unauthenticated requests to `GET` and `POST /api/admin/products` return HTTP 401; authenticated non-admin requests return HTTP 403 without invoking `createProductWithVariants`.

---

## Verification Suite Results

- `CI=true ./init.sh`:
  - Lint: `pnpm lint` passed (0 errors, 0 warnings).
  - Typecheck: `pnpm typecheck` passed (0 errors).
  - Tests: `vitest run` passed across 86 test files / 609 tests (+5 test files / +20 tests for `admin-product-create`).
- `pnpm build`: Next.js 16.4.0 Turbopack production build succeeded, registering `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, and `/api/admin/products` as dynamic routes (`ƒ`).

## Conclusion

The feature meets all specifications, architectural boundaries, and constraints. Verdict: **ACCEPT**.
