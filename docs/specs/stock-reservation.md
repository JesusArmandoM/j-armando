# Feature Implementation Spec: The last unit of a variant cannot be oversold

## Source Feature

- `id`: `stock-reservation`
- `area`: `inventory`
- `depends_on`: `["order-creation-on-payment"]`
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When two or more shoppers attempt to buy the last unit of the same variant at the same time:
1. Exactly one order succeeds, decrements variant stock, and transitions to a paid order.
2. The losing shopper's checkout is rejected with a clear out-of-stock conflict message (`HTTP 409 Conflict`), and an actionable "Return to cart" link is presented.
3. The losing shopper's cart remains active and unconverted so they do not lose other items in their cart.
4. Variant stock in the database never drops below zero and remains strictly consistent.
5. In multi-item checkouts, lines are locked and decremented in deterministic order of `variantId` to prevent database deadlocks under high concurrency.

## Non-Goals

- Reserving stock when adding items to the cart with arbitrary timer expiration (e.g. 15-minute countdown locks), which creates stale cart hoarding and cart-abandonment deadlocks. Atomic validation at payment time ensures zero-leak inventory management.
- Backordering, partial fulfillment, or negative inventory.
- Waitlist notification systems or customer backorder email notifications.

## Job Story

When two shoppers race to place an order containing the last available unit of a variant,
I want the store to atomically validate and decrement stock inside the checkout database transaction,
so that only one order is confirmed, stock never goes negative, and the losing shopper receives a clear explanation and can return to their cart to adjust their selection.

## Users And Permissions

- **Shopper (Guest Checkout):** Completes checkout steps and clicks "Place Order (Simulated)".
- If stock is available: The order is confirmed and the shopper is redirected to `/checkout/confirmation/[reference]`.
- If stock was depleted by a concurrent checkout: The transaction rolls back cleanly, the checkout step displays an out-of-stock alert with a "Return to cart" link, and their cart remains active.

## Acceptance Scenarios

### Scenario 1: Concurrent checkout race on the last unit
Given a variant with `stockQty = 1`
And two distinct shoppers (Shopper A and Shopper B), each with an active cart containing 1 unit of this variant, completed shipping addresses, and selected shipping methods
When both shoppers submit payment simultaneously
Then exactly one checkout succeeds and returns `{ ok: true, order: { ... } }`
And exactly one checkout fails and returns `{ ok: false, reason: "out_of_stock", variantId, productName }`
And the database variant `stock_qty` is exactly 0 (never negative)
And exactly one row is created in the `order` table
And the winning cart is converted (`status: "converted"`)
And the losing cart remains active (`status: "active"`).

### Scenario 2: Atomic conditional stock decrement and transaction rollback
Given an active checkout session with cart lines
When `createPaidOrderFromCheckout` runs
Then inside the database transaction, cart lines are sorted deterministically by `variantId`
And an atomic conditional update is performed for each variant:
  `UPDATE variant SET stock_qty = stock_qty - qty WHERE id = variant_id AND stock_qty >= qty RETURNING id, stock_qty`
And if any variant has insufficient stock (`updated.length === 0`), `OutOfStockError` is thrown
And the entire database transaction rolls back, leaving no created address, order, order lines, payment record, or converted cart.

### Scenario 3: Attempting checkout with zero stock or exceeding stock
Given a cart containing a variant whose database `stock_qty` is 0 or less than the cart line quantity
When payment is initiated
Then the checkout fails immediately with `reason: "out_of_stock"`
And no order is created and variant stock is unchanged.

### Scenario 4: API returns HTTP 409 Conflict with out_of_stock code
Given a checkout payment attempt that fails due to depleted variant stock
When `POST /api/checkout/pay` executes
Then the endpoint responds with HTTP 409 Conflict and `Cache-Control: no-store`
And the response JSON contains:
  ```json
  {
    "error": "One or more items in your cart are no longer available in the requested quantity. Please review your cart.",
    "code": "out_of_stock",
    "variantId": "...",
    "productName": "..."
  }
  ```

### Scenario 5: Checkout UI presents out-of-stock notice and Return to cart link
Given a shopper on `/checkout` whose payment request returns HTTP 409 `out_of_stock`
When the response is received
Then the payment error banner renders the out-of-stock message
And renders an accessible "Return to cart" link (`data-testid="out-of-stock-cart-link"`) with `href="/cart"`
And the "Place Order" button is re-enabled so the shopper can interact or retry.

### Scenario 6: Deadlock prevention in concurrent multi-variant checkouts
Given two concurrent checkouts containing overlapping sets of variants
When both checkouts process concurrently
Then both acquire variant row locks in the identical lexicographical order of `variantId`
And neither transaction deadlocks in PostgreSQL.

## Technical Plan

1. **Database Layer (`db/order.ts`):**
   - Export `OutOfStockError` class carrying `variantId` and `productName`.
   - Update `CreatePaidOrderResult` to include `reason: "out_of_stock"`, `variantId?: string`, and `productName?: string`.
   - In `createPaidOrderFromCheckout`:
     - Inside `db.transaction(async (tx) => { ... })`:
       - Sort cart lines deterministically by `variantId`.
       - Execute atomic update with `gte(variant.stockQty, line.quantity)`.
       - Throw `OutOfStockError` if `updated.length === 0`.
     - Catch `OutOfStockError` and return `{ ok: false, reason: "out_of_stock", variantId, productName }`.

2. **API Layer (`app/api/checkout/pay/route.ts`):**
   - Inspect `result.reason === "out_of_stock"`.
   - Return HTTP 409 with `{ error, code: "out_of_stock", variantId, productName }` and `Cache-Control: no-store`.

3. **Storefront Checkout UI (`app/checkout/contact-and-address-form.tsx`):**
   - Add `isOutOfStock` boolean state.
   - On payment response error with `data?.code === "out_of_stock"`, set `isOutOfStock(true)`.
   - Render payment error banner with message and `<Link href="/cart">Return to cart</Link>`.
   - Style in `app/globals.css`.

4. **Automated Verification:**
   - DB concurrency test: `db/tests/stock-reservation.test.ts`.
   - API route test: `app/api/checkout/pay/route.test.ts`.
   - UI component test: `app/checkout/contact-and-address-form.test.tsx`.
   - Standard gate: `./init.sh` and `pnpm build`.
