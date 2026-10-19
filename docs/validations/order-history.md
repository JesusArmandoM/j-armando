# Validation Record: order-history

## Feature Information

- **Feature ID:** `order-history`
- **Spec:** `docs/specs/order-history.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Signed-in customer lists their own orders with correct lines and totals
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/order-history.test.ts` ("lists orders owned by account in descending order with frozen totals and lines"):
    - `listOrdersForAccount(db, accountId)` returns only orders belonging to the authenticated account, sorted newest first (`createdAt desc`).
    - Verifies line count, item count, frozen line unit prices, subtotal, shipping, sales tax, and total in integer cents matching the purchase record.
  - `app/api/account/orders/route.test.ts`:
    - `GET /api/account/orders` with valid session cookie returns 200 `{ ok: true, orders: [...] }`.
  - `app/account/orders/page.test.tsx`:
    - Renders order list with reference `JA-654321`, formatted date, status badge ("Status: Paid"), fulfillment status badge ("Fulfillment: Unfulfilled"), item count ("2 items"), lines preview, total formatted in USD ("$283.92"), and details link.
  - Dev server live transcript (PORT 3014):
    - `GET /api/account/orders` with session cookie returned 200 with the customer's own order.
    - `GET /account/orders` rendered HTML with the customer's order reference and frozen total.

### Scenario 2: Signed-in customer with no orders sees an empty state
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/order-history.test.ts`:
    - `listOrdersForAccount(db, emptyAccountId)` returns `[]`.
  - `app/account/orders/page.test.tsx`:
    - When orders array is empty, renders `data-testid="orders-empty"` displaying `"You haven't placed any orders yet."` and `"Browse Collection"` action button linking to `/catalog`.
  - Dev server live transcript (PORT 3014):
    - Customer C with no orders visited `/account/orders` and saw the empty state message.

### Scenario 3: Signed-in customer views detail of their own order
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/order-history.test.ts`:
    - `getOrderByReferenceForAccount(db, reference, accountId)` returns complete `OrderWithDetails` with address, shipping method, and frozen line items.
  - `app/api/account/orders/[reference]/route.test.ts`:
    - `GET /api/account/orders/[reference]` returns 200 `{ ok: true, order }` for the order's owner.
  - `app/account/orders/[reference]/page.test.tsx`:
    - Renders reference, date placed, status badge, fulfillment badge, contact email, items ordered (product, variant, qty, unit price in USD, line total in USD), delivery details (recipient name, address, shipping method, estimate, cost), and financial summary (Subtotal, Shipping, Estimated Tax, Total in USD).
  - Dev server live transcript (PORT 3014):
    - `GET /api/account/orders/JA-XXXXXX` returned 200 with full itemized breakdown.

### Scenario 4: Cross-customer isolation (customer cannot access another customer's order)
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/order-history.test.ts`:
    - Customer A listing orders sees none of Customer B's orders.
    - Customer A attempting `getOrderByReferenceForAccount` with Customer B's reference returns `null`.
  - `app/api/account/orders/[reference]/route.test.ts`:
    - Requesting another account's order returns HTTP 404 `{ ok: false, error: "Order not found" }`.
  - `app/account/orders/[reference]/page.test.tsx`:
    - Calls Next.js `notFound()` when accessing an order belonging to another customer.
  - Dev server live transcript (PORT 3014):
    - Customer A attempting `GET /api/account/orders/[refB]` returned HTTP 404.
    - Customer A attempting `GET /account/orders/[refB]` returned HTTP 404 Not Found HTML.

### Scenario 5: Signed-out visitor is barred from order history
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/api/account/orders/route.test.ts` & `app/api/account/orders/[reference]/route.test.ts`:
    - Both endpoints return HTTP 401 `{ ok: false, error: "Unauthorized" }` without a valid `ja_account_session` cookie.
  - `app/account/orders/page.test.tsx` & `app/account/orders/[reference]/page.test.tsx`:
    - Both pages redirect unauthenticated visitors to `/account/signin?returnUrl=...`.
  - Dev server live transcript (PORT 3014):
    - `curl -I http://127.0.0.1:3014/account/orders` returned HTTP 307 with `location: /account/signin?returnUrl=/account/orders`.
    - `curl -I http://127.0.0.1:3014/api/account/orders` returned HTTP 401.
    - `curl -I http://127.0.0.1:3014/api/account/orders/JA-123456` returned HTTP 401.

### Scenario 6: Customer account navigation includes links to order history
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/account/page.tsx`:
    - Added "Order History" button in card actions (`data-testid="account-orders-btn"`).
    - Added "Order History" link in navigation footer (`data-testid="account-orders-link"`).
  - `app/account/page.test.tsx`:
    - Asserts presence of `account-orders-btn` and `account-orders-link`.

---

## Verification Suite Results

- `CI=true ./init.sh`: exit 0. Standard non-blocking gate (install + lint + typecheck + tests).
- `vitest run`: 77 test files passed, 577 tests green (+5 test files / +21 tests).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (Next.js 16.4.0 Turbopack production build; `/account/orders`, `/account/orders/[reference]`, `/api/account/orders`, and `/api/account/orders/[reference]` registered as dynamic routes).
- Dev server live transcript: Tested against PostgreSQL on PORT 3014.

---

## Conclusion

All acceptance scenarios are verified with automated tests and live dev server execution. Cross-customer data isolation and unauthenticated access control are strictly enforced. All money representations remain integer cents until UI presentation via `formatPriceUSD`.

**Verdict: ACCEPT**
