# Validation Record: payment-failure-path

## Feature Information

- **Feature ID:** `payment-failure-path`
- **Spec:** `docs/specs/payment-failure-path.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Failed payment creates no order, leaves cart active, and leaves stock unchanged
- **Result:** PASS
- **Evidence:** Verified in `db/tests/payment-failure-path.test.ts` ("leaves no paid order, does not decrement stock, and preserves active cart on payment failure"):
  - When payment provider returns `payment.failed`, `createPaidOrderFromCheckout` returns `{ ok: false, reason: "payment_failed", paymentOutcome: "payment.failed", failureReason: "card_declined" }`.
  - Database assertions confirm 0 rows in `order`, 0 rows in `order_line`, 0 rows in `payment`, and 0 rows in `address`.
  - `cart.status` remains `"active"`.
  - `getCartSummary` returns the cart with intact lines and quantities (quantity 2).
  - Variant stock quantity in `variant.stock_qty` is unchanged (stock remains at initial level).

### Scenario 2: Pending payment authorization creates no order and preserves active cart
- **Result:** PASS
- **Evidence:** Verified in `db/tests/payment-failure-path.test.ts` ("leaves no paid order and preserves active cart on pending payment authorization"):
  - When payment provider returns `payment.pending`, `createPaidOrderFromCheckout` returns `{ ok: false, reason: "payment_failed", paymentOutcome: "payment.pending" }`.
  - 0 rows inserted in `order` and `payment`.
  - Cart remains `"active"`.
  - In `app/api/checkout/pay/route.test.ts`, verified route returns HTTP 400 with `{ ok: false, error: "Payment is pending authorization. Please wait or check your account.", code: "payment_pending", retryable: false }`.

### Scenario 3: Route returns structured retryable error response on payment failure
- **Result:** PASS
- **Evidence:** Verified in `app/api/checkout/pay/route.test.ts` ("returns 400 with retryable error payload when payment provider fails" & "drives payment scenario 'fail' with failureReason from request body"):
  - Route returns HTTP 400 with `Cache-Control: no-store`.
  - Body contains `{ ok: false, error: "Payment failed: The payment was declined. Please try another payment method.", code: "payment_failed", retryable: true, failureReason: "card_declined" }`.
  - Supports custom failure reason (e.g. `insufficient_funds` returns `"Payment failed: Insufficient funds. Please try another payment method."`).

### Scenario 4: Checkout UI displays failure message and enables immediate retry
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/contact-and-address-form.test.tsx` ("allows selecting simulated failure scenario and displays failure error with enabled retry") and `app/checkout/page.test.tsx` ("handles payment failure and preserves checkout flow allowing retry"):
  - Error banner renders with `data-testid="payment-error"` showing the failure message.
  - "Place Order (Simulated)" button with `data-testid="place-order-button"` remains enabled (`disabled={false}`).
  - Shopper can select another option and trigger retry without page reload or loss of address/shipping information.

### Scenario 5: Successful retry converts cart and completes checkout
- **Result:** PASS
- **Evidence:** Verified in `db/tests/payment-failure-path.test.ts` ("allows retrying the preserved cart with success to produce a paid order and convert the cart"), `app/api/checkout/pay/route.test.ts` ("supports retrying after failure and returns 200 with redirectUrl on success"), and `app/checkout/contact-and-address-form.test.tsx` ("allows retrying payment after failure and redirects on success"):
  - Retrying with scenario `"succeed"` successfully creates the order in `"paid"` status with reference `JA-XXXXXX`.
  - Cart converts to `"converted"` and subsequent `getCartSummary` calls return `undefined`.
  - Route returns HTTP 200 with `redirectUrl: "/checkout/confirmation/JA-XXXXXX"`.
  - Router navigates shopper to the confirmation screen.

---

## Verification Suite Results

- `CI=true ./init.sh`: **58 test files / 474 tests passed** (0 failures).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (Next.js 16.4.0 Turbopack production build succeeded; route table includes dynamic `ƒ /api/checkout/pay`, `ƒ /checkout`).
- Focused test suites:
  - `db/tests/payment-failure-path.test.ts`: 3/3 passed
  - `db/tests/order-creation.test.ts`: 6/6 passed
  - `app/api/checkout/pay/route.test.ts`: 10/10 passed
  - `app/checkout/contact-and-address-form.test.tsx`: 12/12 passed
  - `app/checkout/page.test.tsx`: 10/10 passed

---

## Findings

None. All verification criteria met:
1. Failed payment produces no order in 'paid' state (no row in DB).
2. Stock is not permanently decremented after a failed payment.
3. Cart preserves lines and can be retried to success.
4. Pending outcome is handled cleanly without creating a paid order.
5. All money values remain integer cents; UI copy in US English.

---

## Verdict

**ACCEPT** — The feature is verified, documented, and ready for PR.
