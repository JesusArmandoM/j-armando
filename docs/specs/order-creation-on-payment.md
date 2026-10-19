# Feature Implementation Spec: A successful payment creates a paid order with frozen prices

## Source Feature

- `id`: `order-creation-on-payment`
- `area`: `orders`
- `depends_on`: `["checkout-sales-tax", "payment-provider-abstraction"]` (both accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When a simulated payment succeeds at checkout:
1. The system creates a paid order with frozen line items, unit prices, subtotal, shipping cost, sales tax, total, and frozen shipping address snapshot.
2. The order has status `"paid"`, fulfillmentStatus `"unfulfilled"`, and records a succeeded payment record.
3. The shopping cart status transitions from `"active"` to `"converted"`, so returning to `/cart` shows an empty cart.
4. The shopper lands on an order confirmation page at `/checkout/confirmation/[reference]` displaying their order reference (e.g. `JA-XXXXXX`), order status, fulfillment status, line items, address, and financial breakdown.

## Non-Goals

- Real payment gateway integration (e.g. Stripe, Adyen) — uses the `PaymentProvider` abstraction with simulated implementation.
- Handling payment failure or retry states — owned by `payment-failure-path`.
- Account creation or credential setup at payment time — owned by `account-created-at-payment` (orders support null `accountId` in the interim).
- Concurrency stock reservations across simultaneous checkouts — owned by `stock-reservation`.
- Order fulfillment lifecycle transitions (`shipped`, `delivered`) or tracking portal — excluded from MVP.

## Job Story

When I complete my contact info, shipping address, and shipping method selection at checkout and click "Place Order",
I want the system to process my payment, create my order with permanently frozen prices and details, clear my shopping cart, and show me a clear order confirmation page,
so that I have immediate proof of purchase with an order reference and know exactly what was ordered and charged.

## Users And Permissions

- **Guest Shopper:** initiates payment from `/checkout` for their active cart session (`ja_cart_session` cookie). When payment succeeds, their order is recorded and they are redirected to their order confirmation.
- **Session Isolation:** order creation is strictly scoped to the active cart identified by the httpOnly `ja_cart_session` cookie. Shoppers can only view confirmation details for their valid order reference.

## Acceptance Scenarios

### Scenario 1: Successful simulated payment creates order with status "paid" and fulfillmentStatus "unfulfilled"
Given a guest shopper on `/checkout` with an active cart containing 1+ items, a saved shipping address, and a selected shipping method
When the shopper submits the payment step
Then the payment provider returns `payment.succeeded`
And an order row is created in the database with:
  - `status: "paid"`
  - `fulfillmentStatus: "unfulfilled"`
  - `currency: "USD"`
  - `paidAt` timestamp set to the payment time
  - a unique human-readable reference formatted as `JA-XXXXXX` (e.g. `JA-` followed by 6 random alphanumeric/numeric characters).

### Scenario 2: Frozen lines and prices snapshot
Given an order created from checkout
When the order lines and totals are inspected
Then the `order_line` table holds frozen snapshot rows with:
  - `productName`, `variantSize`, `variantColor`, `unitPriceCents`, `quantity`, `lineTotalCents`
  - `variantId` referencing the purchased variant
And the `order` table holds frozen totals:
  - `subtotalCents`: sum of line totals in integer cents
  - `shippingCents`: cost of selected shipping method in integer cents
  - `taxCents`: destination state sales tax in integer cents
  - `totalCents`: `subtotalCents + shippingCents + taxCents`
And subsequent changes to catalog product base prices or variant overrides do not alter the order's frozen line totals or order total.

### Scenario 3: Active cart is converted and shows empty
Given a shopper who completed payment
When the order transaction commits
Then the cart's status is updated to `"converted"`
And navigating back to `/cart` or `/checkout` displays the empty cart state with "Continue Shopping" link.

### Scenario 4: Shopper is redirected to order confirmation screen
Given a successful order creation response
When the shopper's browser receives `{ ok: true, reference, redirectUrl }`
Then the shopper is redirected to `/checkout/confirmation/[reference]`
And the confirmation page renders:
  - Order reference (e.g. `JA-123456`)
  - Status ("Paid") and Fulfillment ("Unfulfilled")
  - Confirmation notice referencing the customer's email
  - Purchased line items table with name, size, color, quantity, unit price, and line total
  - Financial breakdown: Subtotal, Shipping, Tax, and Total formatted in USD
  - Shipping address card showing recipient name, street lines, city, state, and ZIP
  - A button/link to return to the catalog ("Continue Shopping").

### Scenario 5: Missing or incomplete checkout session blocks payment
Given a payment request where:
  - Cart has no items, or
  - Contact/address (Step 1) is incomplete, or
  - Shipping method (Step 2) is not selected
When payment is attempted
Then the request is rejected with HTTP 400 and a descriptive error message
And no order or payment row is created in the database.

### Scenario 6: Database transaction atomicity
Given a payment attempt that succeeds
When the database transaction executes
Then the address snapshot, order record, order line records, payment record, and cart status update are all committed atomically within the same transaction
And if any part fails, the entire transaction rolls back leaving no orphaned order or converted cart.

## Technical Plan

1. **Schema Updates (Migration 0004):**
   - In `db/schema/order.ts`, update `order.accountId` to be nullable (`accountId: uuid("account_id").references(() => account.id)`).
   - In `db/schema/enums.ts`, add `"unfulfilled"` to `fulfillmentStatus` enum.
   - Migration `db/migrations/0004_mean_texas_twister.sql` applied.

2. **Order Repository (`db/order.ts`):**
   - `createPaidOrderFromCheckout(db, sessionToken, provider?)`:
     - Reads active cart and lines for `sessionToken` (rejects if empty).
     - Reads `checkoutSession` (rejects if missing address or `shippingMethodId`).
     - Computes totals: `subtotalCents`, `shippingCents`, `taxCents = calculateSalesTax(subtotal, state).taxCents`, `totalCents`.
     - Calls `provider.createPayment(...)` (defaults to `createSimulatedPaymentProvider({ scenario: "succeed" })`).
     - On `payment.succeeded`, within a database transaction:
       1. Insert into `address` (accountId: null, recipientName, line1, line2, city, state, zip, country: "US", phone).
       2. Generate unique order reference `JA-${Math.floor(100000 + Math.random() * 900000)}` (or collision retry).
       3. Insert into `order` (`reference`, `accountId: null`, `contactEmail`, `status: "paid"`, `fulfillmentStatus: "unfulfilled"`, `addressId`, `shippingMethodId`, `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, `currency: "USD"`, `paidAt: new Date()`).
       4. Insert into `orderLine` for each cart line with frozen snapshot data.
       5. Insert into `payment` (`orderId`, `status: "succeeded"`, `provider: "simulated"`, `amountCents: totalCents`).
       6. Update `cart` (`status: "converted"`, `updatedAt: new Date()`).
       7. Return `{ ok: true, order: { id, reference, totalCents, contactEmail } }`.
   - `getOrderByReference(db, reference)`:
     - Selects order by reference, joins lines, shipping address, and shipping method.
     - Returns full order details with typed lines and address.

3. **API Route Handler (`app/api/checkout/pay/route.ts`):**
   - Handles `POST /api/checkout/pay`.
   - Reads `ja_cart_session` cookie from request.
   - Calls `createPaidOrderFromCheckout(getDb(), sessionToken)`.
   - Returns `{ ok: true, reference: order.reference, redirectUrl: "/checkout/confirmation/" + order.reference }` with `Cache-Control: no-store`.
   - Revalidates `/cart` and `/checkout` paths.

4. **Checkout UI Step 3 (`app/checkout/contact-and-address-form.tsx` / `page.tsx`):**
   - When Step 1 and Step 2 are completed, Step 3 (Payment) shows:
     - Payment details notice ("Simulated Payment Provider").
     - Total payable amount formatted in USD.
     - "Place Order (Simulated)" submit button.
     - Loading / submitting spinner state.
     - Error banner if payment fails.
   - On success, navigates to `redirectUrl` (`/checkout/confirmation/[reference]`).

5. **Order Confirmation Page (`app/checkout/confirmation/[reference]/page.tsx`):**
   - Server Component reading `params.reference`.
   - Fetches order using `getOrderByReference(getDb(), reference)`.
   - Displays:
     - Eyebrow "Order Confirmed" and heading "Thank you for your order!".
     - Order reference pill `JA-XXXXXX`.
     - Status badges: Status: Paid, Fulfillment: Unfulfilled.
     - Notice: "A confirmation email has been sent to [contactEmail]."
     - Itemized frozen line items table.
     - Financial summary: Subtotal, Shipping, Tax, Total.
     - Shipping address card.
     - "Continue Shopping" CTA linking to `/catalog`.
   - Handles not found (404 / friendly error) when reference does not exist.

6. **Verification & Tests:**
   - DB integration tests in `db/tests/order-creation.test.ts`:
     - Successful order creation with frozen prices.
     - Cart converted to "converted", lines no longer returned in getCartSummary.
     - Catalog price change does not affect created order lines.
     - Incomplete checkout session fails with clear reason.
     - Transaction rollback on error.
     - `getOrderByReference` returns complete order with lines and address.
   - API route tests in `app/api/checkout/pay/route.test.ts`:
     - Returns 200 with redirectUrl and reference on success.
     - Returns 400 when session is missing or incomplete.
     - Returns 503 on unexpected DB failure.
   - UI tests in `app/checkout/page.test.tsx` and confirmation page tests in `app/checkout/confirmation/page.test.tsx`:
     - Step 3 renders Place Order button when Steps 1 & 2 are complete.
     - Confirmation page renders reference, status, fulfillment, frozen lines, totals, address.
   - Standard gate: `./init.sh` exit 0, `pnpm build` exit 0.
