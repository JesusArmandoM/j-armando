# Validation Record: guest-cart-manage

## Feature Information

- **Feature ID:** `guest-cart-manage`
- **Spec:** `docs/specs/guest-cart-manage.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Increasing line quantity updates line total and cart subtotal
- **Result:** PASS
- **Evidence:** Tested via `CartLineRow` component tests (`app/cart/cart-line-row.test.tsx`), route tests (`app/api/cart/lines/route.test.ts`), and database integration tests (`db/tests/guest-cart-manage.test.ts`). Stepper `+` increments quantity by 1, calls `PATCH /api/cart/lines` with `{ lineId, quantity }`, and updates line total and subtotal.

### Scenario 2: Decreasing line quantity down to 1
- **Result:** PASS
- **Evidence:** Stepper `-` decrements quantity down to 1. When quantity reaches 1, `-` button is disabled (`disabled={busy || line.quantity <= 1}`).

### Scenario 3: Stepper upper bound is 10
- **Result:** PASS
- **Evidence:** When quantity is 10, `+` button is disabled (`disabled={busy || line.quantity >= 10}`). API route rejects quantity > 10 with 400.

### Scenario 4: Removing a line removes it and updates subtotal
- **Result:** PASS
- **Evidence:** Clicking `Remove` calls `DELETE /api/cart/lines` with `{ lineId }`. DB row is deleted transactionally, and remaining lines recalculate subtotal.

### Scenario 5: Removing the last item shows empty cart state
- **Result:** PASS
- **Evidence:** When the last line is removed, `getCartSummary` returns `undefined` (0 lines), and `/cart` transitions to the empty state component ("Your cart is empty.").

### Scenario 6: Changes persist across page reload
- **Result:** PASS
- **Evidence:** Updates and deletes are committed to PostgreSQL `cart_line` table with `updatedAt` bumped on `cart`. Re-fetching `/cart` reflects all changes.

### Scenario 7: Security and session isolation
- **Result:** PASS
- **Evidence:** Both `updateCartLineQuantity` and `removeCartLine` require matching `sessionToken`. Requests with non-existent lineId or line belonging to another session return 404 (`not_found`). Non-JSON and non-UUID inputs return 400.

---

## Verification Suite Results

- `CI=true ./init.sh`: **44 test files / 358 tests passed** (0 failures).
- `pnpm lint`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm build`: exit 0 (compiled dynamic routes `ƒ /cart`, `ƒ /api/cart/lines`).
- Focused cart suites:
  - `db/tests/guest-cart-manage.test.ts`: 5/5 passed
  - `app/api/cart/lines/route.test.ts`: 21/21 passed
  - `app/cart/cart-input.test.ts`: 8/8 passed
  - `app/cart/cart-line-row.test.tsx`: 7/7 passed
  - `app/cart/page.test.tsx`: 4/4 passed

---

## Findings

None. All 7 acceptance scenarios pass cleanly. Scope discipline holds (no stock cap or checkout absorption).
