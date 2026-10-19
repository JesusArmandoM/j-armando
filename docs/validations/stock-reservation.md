# Validation Record: stock-reservation

## Feature Information

- **Feature ID:** `stock-reservation`
- **Spec:** `docs/specs/stock-reservation.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Concurrent checkout race on the last unit
- **Result:** PASS
- **Evidence:** Verified in `db/tests/stock-reservation.test.ts` ("concurrent checkouts of the last unit yield exactly one paid order and never negative stock"):
  - Variant stock initialized to 1.
  - Two distinct carts and checkout sessions (Shopper A and Shopper B) created with 1 unit of the variant, shipping address, and shipping method.
  - Concurrent execution via `Promise.all([createPaidOrderFromCheckout(db, tokenA), createPaidOrderFromCheckout(db, tokenB)])`.
  - Exactly one call resolved `{ ok: true }` and created an order row.
  - Exactly one call resolved `{ ok: false, reason: "out_of_stock", variantId, productName }`.
  - Database variant `stock_qty` is exactly 0 (never negative).
  - Exactly one order row exists in the `order` table.
  - Winning cart is converted; losing cart remains active and unconverted.

### Scenario 2: Atomic conditional stock decrement and transaction rollback
- **Result:** PASS
- **Evidence:** Verified in `db/order.ts` and `db/tests/stock-reservation.test.ts`:
  - Cart lines are sorted deterministically by `variantId` before decrementing.
  - Atomic conditional update:
    `UPDATE variant SET stock_qty = stock_qty - qty WHERE id = variant_id AND stock_qty >= qty RETURNING id, stock_qty`
  - Throws `OutOfStockError` if `updated.length === 0`, cleanly rolling back the database transaction. No orphaned address, order, lines, or payment records are persisted.

### Scenario 3: Attempting checkout with zero stock or exceeding stock
- **Result:** PASS
- **Evidence:** Verified in `db/tests/stock-reservation.test.ts`:
  - "fails with out_of_stock when variant stock is 0 without creating an order": Attempting checkout with 0 stock returns `{ ok: false, reason: "out_of_stock" }`, stock stays 0, cart remains active.
  - "fails with out_of_stock when cart quantity exceeds available stock": Cart requesting quantity 3 against available stock of 2 returns `{ ok: false, reason: "out_of_stock" }`, stock remains 2, cart remains active.

### Scenario 4: API returns HTTP 409 Conflict with out_of_stock code
- **Result:** PASS
- **Evidence:** Verified in `app/api/checkout/pay/route.test.ts` ("returns 409 when cart items are out of stock"):
  - `POST /api/checkout/pay` returns HTTP status 409 (Conflict).
  - Response headers include `cache-control: no-store`.
  - Body contains `{ error: "One or more items in your cart are no longer available in the requested quantity. Please review your cart.", code: "out_of_stock", variantId, productName }`.

### Scenario 5: Checkout UI presents out-of-stock notice and Return to cart link
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/contact-and-address-form.test.tsx` ("displays out of stock error and return to cart link when API returns out_of_stock"):
  - Payment error banner renders the out-of-stock explanation.
  - Accessible link `data-testid="out-of-stock-cart-link"` is rendered pointing to `/cart` with label "Return to cart".
  - Submit button re-enables for continued interaction.

### Scenario 6: Deadlock prevention in concurrent multi-variant checkouts
- **Result:** PASS
- **Evidence:** Verified in `db/order.ts`:
  - Cart lines are sorted lexicographically by `variantId` prior to decrementing, ensuring identical lock acquisition order across concurrent transactions.

---

## Verification Suite Results

- `CI=true ./init.sh`: **58 test files / 470 tests passed** (0 failures).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (Next.js 16.4.0 Turbopack production build; all routes dynamic/static as expected).
- Focused test suites:
  - `db/tests/stock-reservation.test.ts`: 3/3 passed
  - `app/api/checkout/pay/route.test.ts`: 8/8 passed
  - `app/checkout/contact-and-address-form.test.tsx`: 11/11 passed
  - `db/tests/order-creation.test.ts`: 6/6 passed
  - `app/checkout/page.test.tsx`: 9/9 passed

---

## Scope Discipline & Architecture

- Integrity: Integer cents for money values preserved.
- Non-negative stock constraint: Enforced by both PostgreSQL CHECK constraint (`chk_variant_stock_qty_non_negative`) and the atomic WHERE condition (`gte(variant.stockQty, line.quantity)`).
- Layering: Order repository in `db/order.ts` encapsulates atomic transactional decrement and error handling; API route in `app/api/checkout/pay/route.ts` translates domain results to HTTP status codes; storefront UI in `app/checkout/contact-and-address-form.tsx` displays user-friendly errors with recovery navigation.

---

## Verdict

**ACCEPT** — The feature is complete, verified, robust against race conditions, and ready for PR.
