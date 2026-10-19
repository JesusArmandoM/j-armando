# Feature Implementation Spec: A failed payment leaves no paid order and preserves the cart

## Source Feature

- `id`: `payment-failure-path`
- `area`: `payments`
- `depends_on`: `["order-creation-on-payment"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When a simulated payment fails or is marked pending at checkout:
1. No order row is created in the `order` table in `paid` status (or any other status).
2. No rows are inserted into `order_line`, `payment`, or `address`.
3. Variant inventory stock (`variant.stock_qty`) is not decremented or permanently consumed.
4. The shopping cart status remains `"active"` (not converted), and all cart lines remain intact and retrievable.
5. The API route returns HTTP 400 with a structured, retryable error response (`{ ok: false, error, code: "payment_failed", retryable: true, failureReason }`).
6. The checkout UI renders a clear error banner (`data-testid="payment-error"`), keeps the "Place Order (Simulated)" button enabled, and allows the shopper to retry.
7. Upon successful retry, the order is created with frozen prices, the cart converts to `"converted"`, and the shopper is redirected to `/checkout/confirmation/[reference]`.

## Non-Goals

- Real card gateway network communication (Stripe, Adyen, etc.) — handled behind `PaymentProvider` abstraction.
- Concurrency stock reservation locking — owned by `stock-reservation`.
- Account creation or linking on checkout — owned by `account-created-at-payment`.
- Order fulfillment state changes — excluded from MVP scope.

## Job Story

When a payment attempt cannot be completed (e.g. card declined or authorization pending),
I want the checkout flow to inform me clearly without losing my cart or creating an unwanted order,
so that my selected garments and quantities remain intact and I can immediately retry with a valid payment.

## Users And Permissions

- **Guest Shopper:** initiates simulated payment from `/checkout`. On payment failure or pending authorization, the shopper remains on `/checkout`, sees the error banner, retains all cart items, and can retry payment.

## Acceptance Scenarios

### Scenario 1: Failed payment creates no order, leaves cart active, and leaves stock unchanged
Given a shopper on `/checkout` with an active cart containing variants with known stock quantities, saved address, and selected shipping method
When the payment step is executed with scenario `"fail"` (e.g. `failureReason: "card_declined"`)
Then `createPaidOrderFromCheckout` returns `{ ok: false, reason: "payment_failed", paymentOutcome: "payment.failed", failureReason: "card_declined" }`
And no row is inserted into `order`, `order_line`, `payment`, or `address`
And the cart's status remains `"active"`
And `getCartSummary` returns the cart with all existing line items and quantities
And variant stock quantities in `variant.stock_qty` are identical to their values before the payment attempt.

### Scenario 2: Pending payment authorization creates no order and preserves active cart
Given a shopper on `/checkout` with an active cart
When the payment step is executed with scenario `"pending"`
Then `createPaidOrderFromCheckout` returns `{ ok: false, reason: "payment_failed", paymentOutcome: "payment.pending" }`
And no row is inserted into `order` or `payment`
And the cart's status remains `"active"`
And the API route returns HTTP 400 with `{ ok: false, error: "Payment is pending authorization. Please wait or check your account.", code: "payment_pending", retryable: false }`.

### Scenario 3: Route returns structured retryable error response on payment failure
Given a payment request sent to `POST /api/checkout/pay` with scenario `"fail"`
When the payment provider declines the charge
Then the route returns HTTP 400 with `Cache-Control: no-store`
And the response JSON contains:
  - `ok: false`
  - `error: "Payment failed: The payment was declined. Please try another payment method."` (or appropriate reason-specific message)
  - `code: "payment_failed"`
  - `retryable: true`
  - `failureReason: "card_declined"` (or specific failure reason).

### Scenario 4: Checkout UI displays failure message and enables immediate retry
Given a shopper on `/checkout` at Step 3 (Payment)
When the payment request fails
Then an error banner with `data-testid="payment-error"` is rendered displaying the failure message
And the "Place Order (Simulated)" button with `data-testid="place-order-button"` is re-enabled (`disabled={false}`)
And the shopper can click the button again to retry the payment without re-entering contact or shipping details.

### Scenario 5: Successful retry converts cart and completes checkout
Given a shopper whose previous payment attempt failed
When the shopper retries payment with scenario `"succeed"`
Then `createPaidOrderFromCheckout` executes the atomic transaction:
  - Creates the `order` in `"paid"` status with frozen prices and reference `JA-XXXXXX`
  - Creates `payment` in `"succeeded"` status
  - Updates `cart.status` to `"converted"`
And the UI redirects the shopper to `/checkout/confirmation/[reference]`.

## Technical Plan

1. **Order Repository (`db/order.ts`):**
   - Export `PaymentScenario` and `CreatePaidOrderOptions` (`{ provider?, scenario?, failureReason? }`).
   - In `createPaidOrderFromCheckout(db, sessionToken, providerOrOptions?)`:
     - If `providerOrOptions` is a `PaymentProvider`, use it.
     - Else resolve scenario (default `"succeed"`) and failureReason (default `"card_declined"`) and create simulated provider.
     - Execute `paymentProvider.createPayment(...)`.
     - If outcome is not `payment.succeeded`, return `{ ok: false, reason: "payment_failed", paymentOutcome, failureReason }` before starting any database transaction.

2. **API Route Handler (`app/api/checkout/pay/route.ts`):**
   - Support driving scenario via `request.headers.get("x-payment-scenario")` or JSON body `{ scenario, failureReason }`.
   - On `result.reason === "payment_failed"`:
     - If `result.paymentOutcome === "payment.pending"`, return HTTP 400 `{ ok: false, error: "Payment is pending authorization...", code: "payment_pending", retryable: false }`.
     - Else return HTTP 400 `{ ok: false, error: "Payment failed: The payment was declined...", code: "payment_failed", retryable: true, failureReason }`.

3. **Checkout UI (`app/checkout/contact-and-address-form.tsx` & `app/globals.css`):**
   - Provide scenario selector in Step 3 payment box (`data-testid="simulated-scenario-group"`: Success, Failure, Pending).
   - In `handlePay()`, send selected scenario in JSON body.
   - On response error, set `paymentError` (rendered with `data-testid="payment-error"`), reset `isPaying` to false to keep `place-order-button` re-enabled for retry.
   - On retry to success, proceed to confirmation redirect.

4. **Testing Suite:**
   - DB tests in `db/tests/payment-failure-path.test.ts`:
     - Test failed payment creates no order, leaves cart active, does not change variant stock.
     - Test pending payment creates no order and leaves cart active.
     - Test retry to success creates order and converts cart.
   - Route tests in `app/api/checkout/pay/route.test.ts`:
     - Test failure scenario returns error payload with retryable true.
     - Test pending scenario returns pending payload with retryable false.
     - Test retry to success returns redirectUrl.
   - UI tests in `app/checkout/contact-and-address-form.test.tsx` and `app/checkout/page.test.tsx`:
     - Renders failure error message on payment failure.
     - Allows retrying payment after failure.
