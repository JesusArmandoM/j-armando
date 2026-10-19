# Validation Record: cart-stock-limits

## Feature Information

- **Feature ID:** `cart-stock-limits`
- **Spec:** `docs/specs/cart-stock-limits.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Add to cart is bounded by variant stock on product page
- **Result:** PASS
- **Evidence:** Verified in `app/products/[slug]/add-to-cart.test.tsx` ("caps the quantity selector options by the selected variant available stock"). The quantity select options dynamically cap at `Math.min(MAX_ADD_QUANTITY, Math.max(1, variant.stockQty))` when a variant is selected.

### Scenario 2: Repeat add exceeding remaining stock is rejected with user-friendly error
- **Result:** PASS
- **Evidence:** Verified in `db/tests/cart-stock-limits.test.ts` ("rejects repeat addVariantToCart when cumulative quantity exceeds available stock"), `app/api/cart/lines/route.test.ts` ("returns 400 with stock_exceeded code when addVariantToCart exceeds available stock"), and `app/products/[slug]/add-to-cart.test.tsx` ("shows stock_exceeded message when server rejects due to stock limit"). Server returns 400 with `{ error: "Only X items available in stock.", code: "stock_exceeded", available: X }`, and the UI displays the alert message clearly without minting unneeded session cookies.

### Scenario 3: Stepper increment disabled when quantity reaches available stock
- **Result:** PASS
- **Evidence:** Verified in `app/cart/cart-line-row.test.tsx` ("disables increment button when quantity equals availableStock"). When line quantity equals `min(10, availableStock)`, the `+` stepper button has the `disabled` attribute set to true.

### Scenario 4: Direct PATCH API call exceeding stock returns 400 stock_exceeded
- **Result:** PASS
- **Evidence:** Verified in `db/tests/cart-stock-limits.test.ts` ("rejects updateCartLineQuantity when new quantity exceeds variant stock") and `app/api/cart/lines/route.test.ts` ("returns 400 with stock_exceeded when updateCartLineQuantity exceeds stock"). Direct mutation requests attempting to exceed inventory return HTTP 400 with `{ error: "Only X items available in stock.", code: "stock_exceeded", available: X }`.

### Scenario 5: Viewing cart automatically clamps quantity when stock has dropped and shows visible warning
- **Result:** PASS
- **Evidence:** Verified in `db/tests/cart-stock-limits.test.ts` ("automatically clamps line quantity and sets stockAdjusted when stock drops below line quantity") and `app/cart/cart-line-row.test.tsx` ("renders stock adjustment notice when line was adjusted"). In `getCartSummary`, lines where `quantity > stockQty > 0` are transactionally clamped in `cart_line` to available stock, `stockAdjusted: true` is set, line totals and subtotal recalculate, and the line renders a visible warning notice (`data-testid="cart-line-stock-warning"`).

### Scenario 6: Viewing cart handles variant that is completely out of stock (stock = 0)
- **Result:** PASS
- **Evidence:** Verified in `db/tests/cart-stock-limits.test.ts` ("removes line and records notification when variant stock drops to 0") and `app/cart/page.test.tsx` ("renders out-of-stock removal notification even when the cart becomes empty"). If stock drops to 0, `getCartSummary` deletes the row from `cart_line`, records a user notification, and the cart renders the notification at the top of `/cart` (`data-testid="cart-notifications"`).

### Scenario 7: Baseline gate and build pass
- **Result:** PASS
- **Evidence:** `CI=true ./init.sh` passed exit 0 across 45 test files and 371 tests. `pnpm build` completed exit 0 with dynamic routes `ƒ /cart` and `ƒ /api/cart/lines`.

---

## Verification Suite Results

- `CI=true ./init.sh`: **45 test files / 371 tests passed** (0 failures).
- `pnpm lint`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm build`: exit 0 (compiled successfully, dynamic routes `ƒ /cart`, `ƒ /api/cart/lines`).
- Focused stock limits suites:
  - `db/tests/cart-stock-limits.test.ts`: 5/5 passed
  - `app/api/cart/lines/route.test.ts`: 23/23 passed (+2 tests)
  - `app/products/[slug]/add-to-cart.test.tsx`: 7/7 passed (+2 tests)
  - `app/cart/cart-line-row.test.tsx`: 9/9 passed (+2 tests)
  - `app/cart/page.test.tsx`: 6/6 passed (+2 tests)

---

## Findings

None. All 7 acceptance scenarios pass cleanly. Stock limits and adjustments are strictly enforced server-side and reflected gracefully in the UI. Concurrency stock reservation during checkout is preserved for `stock-reservation`.
