# Validation Record: admin-order-list

## Feature Information

- **Feature ID:** `admin-order-list`
- **Spec:** `docs/specs/admin-order-list.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Admin sees orders across all customers
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-order-list.test.ts` ("Scenario 1 & 3: lists orders across all distinct customer accounts in descending order and retrieves full details for any customer's order"):
    - Creates orders across two distinct customer accounts (`alice.customer@example.com` and `bob.shopper@example.com`).
    - `listAllOrdersForAdmin(db)` returns all orders across both customers ordered by `createdAt` descending, including accurate `reference`, `contactEmail`, `status`, `fulfillmentStatus`, `itemCount`, `lineCount`, and frozen integer-cent totals.
  - `app/api/admin/orders/route.test.ts` ("returns 200 with all orders across customers when authorized as admin"):
    - Returns HTTP 200 `{ ok: true, orders }` with `Cache-Control: no-store`.
  - `app/admin/orders/page.test.tsx` ("renders orders from all customers with reference, customer email, statuses, items, and formatted USD total"):
    - Renders table rows for all customers showing order reference (linking to `/admin/orders/[reference]`), date, customer email, item count, payment status badge, fulfillment status badge, and USD total formatted via `formatPriceUSD`.

### Scenario 2: Empty state when no orders have been placed
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-order-list.test.ts` ("Scenario 2: returns empty array when no orders exist in the database"):
    - `listAllOrdersForAdmin(db)` returns `[]`.
  - `app/admin/orders/page.test.tsx` ("renders empty state when no orders exist"):
    - Renders `data-testid="admin-orders-empty"` ("No orders yet").

### Scenario 3: Admin opens read-only detail for any customer's order
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-order-list.test.ts`:
    - `getOrderForAdmin(db, reference)` returns full order details for both `alice.customer@example.com` and `bob.shopper@example.com`, including frozen `lines`, `shippingAddress`, `shippingMethod`, and financial totals.
  - `app/api/admin/orders/[reference]/route.test.ts` ("returns 200 with full order details for any customer when authorized as admin"):
    - Returns HTTP 200 `{ ok: true, order }` with `Cache-Control: no-store`.
  - `app/admin/orders/[reference]/page.test.tsx` ("renders read-only order details, frozen lines, delivery details, and financial summary"):
    - Renders reference, customer email, payment status, fulfillment status, frozen order lines (product name, size, color, quantity, unit price, line total), delivery snapshot (shipping address and method), financial summary (Subtotal, Shipping, Estimated Tax, Total in USD), and back link to `/admin/orders`.

### Scenario 4: Unknown order reference returns 404
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-order-list.test.ts` ("Scenario 4: getOrderForAdmin returns null for unknown or empty reference"):
    - Returns `null` for `JA-999999` and empty/whitespace strings.
  - `app/api/admin/orders/[reference]/route.test.ts` ("returns 404 when order reference does not exist"):
    - Returns HTTP 404 `{ ok: false, error: "Order not found." }` with `Cache-Control: no-store`.
  - `app/admin/orders/[reference]/page.test.tsx` ("calls notFound() when order reference does not exist"):
    - Invokes Next.js `notFound()`.

### Scenario 5: Non-admin and unauthenticated visitors are barred
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/api/admin/orders/route.test.ts` & `app/api/admin/orders/[reference]/route.test.ts`:
    - Unauthenticated requests return HTTP 401 `{ ok: false, error: "Authentication required." }` without querying the database.
    - Non-admin customer requests return HTTP 403 `{ ok: false, error: "Access denied. Admin role required." }` without querying the database.
  - `app/admin/orders/page.test.tsx` & `app/admin/orders/[reference]/page.test.tsx`:
    - Unauthenticated visitors redirect to `/account/signin?returnUrl=...`.
    - Non-admin visitors receive `data-testid="admin-forbidden"` ("Access Denied: You do not have permission to view the backoffice.").

---

## Verification Suite Results

- `CI=true ./init.sh`:
  - Lint: `pnpm lint` passed with zero errors, zero warnings.
  - Typecheck: `pnpm typecheck` passed with zero errors.
  - Tests: `vitest run` passed across 86 test files / 608 tests (+5 test files / +19 tests for `admin-order-list`).
- `pnpm build`: Next.js 16.4.0 Turbopack production build succeeded (`/admin/orders`, `/admin/orders/[reference]`, `/api/admin/orders`, `/api/admin/orders/[reference]` registered as dynamic routes).

## Conclusion

The feature meets all specifications and constraints while keeping order views strictly read-only (`admin-order-fulfillment` remains cleanly separated). Verdict: **ACCEPT**.
