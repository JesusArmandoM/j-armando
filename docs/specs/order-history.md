# Feature Implementation Spec: Customer sees their order history

## Source Feature

- `id`: `order-history`
- `area`: `orders`
- `depends_on`: `["account-signin-signout", "order-creation-on-payment"]` (both accepted)
- `status`: `in_progress`
- `source`: `feature_list.json`

## Goal

Provide a signed-in customer with complete visibility into their previous orders:
1. **Data Access Layer (`db/order.ts`):**
   - `listOrdersForAccount(db, accountId)`: returns orders belonging to `accountId` ordered by `createdAt` descending, including line item summary, item count, frozen financial totals in integer cents, shipping address, and shipping method snapshot.
   - `getOrderByReferenceForAccount(db, reference, accountId)`: retrieves the order matching both `reference` and `accountId`. Returns `null` if the order does not exist or belongs to another customer.
2. **API Route Handlers:**
   - `GET /api/account/orders`: reads `ja_account_session` cookie; returns `{ ok: true, orders: [...] }` if authenticated, or 401 Unauthorized if signed out or invalid session.
   - `GET /api/account/orders/[reference]`: reads `ja_account_session` cookie; returns `{ ok: true, order: {...} }` if owned, 404 Not Found if unowned or non-existent, or 401 Unauthorized if signed out.
3. **Storefront UI:**
   - `app/account/orders/page.tsx`: server component displaying customer's order history.
     - Redirects signed-out visitors to `/account/signin?returnUrl=/account/orders`.
     - Displays "Order History".
     - Empty state when no orders: "You haven't placed any orders yet." with link to `/catalog`.
     - Order list when orders exist: reference (e.g. `JA-123456`), date placed, status, fulfillment status, item count, total formatted via `formatPriceUSD`, and link to detail page.
   - `app/account/orders/[reference]/page.tsx`: server component displaying detailed view of one order.
     - Redirects signed-out visitors to `/account/signin`.
     - Invokes `notFound()` if order is not owned by the customer or does not exist.
     - Displays reference, date, status, fulfillment status, delivery details (shipping address and shipping method), itemized frozen lines (product name, size, color, quantity, unit price, line total), financial breakdown (Subtotal, Shipping, Estimated Tax, Total), and back link to `/account/orders`.
   - `app/account/page.tsx`: includes link/button to `/account/orders` ("Order History").
4. **Security & Data Ownership:**
   - Customers can NEVER see another customer's orders. Querying another customer's reference or id returns 404 / `notFound()`.
   - Unauthenticated access is barred; requests redirect to sign-in or return 401.
   - Financial totals match the frozen integer cent amounts recorded at purchase time.

## Non-Goals

- Order cancellation or modification (out of MVP scope).
- Tracking portal or live courier tracking integration (explicit non-goal per `docs/mvp-scope.md`).
- Returns and refund processing (out of MVP scope).

## Acceptance Scenarios

### Scenario 1: Signed-in customer lists their own orders with correct lines and totals
Given a signed-in customer who has placed one or more orders
When the customer navigates to `/account/orders` (or requests `GET /api/account/orders`)
Then the customer sees a list of only their own orders ordered by creation date desc
And each order card/item shows the reference, formatted date, order status, fulfillment status, item count, and frozen total formatted in USD
And the order totals match the frozen snapshot values recorded at purchase time.

### Scenario 2: Signed-in customer with no orders sees an empty state
Given a signed-in customer who has not placed any orders
When the customer navigates to `/account/orders`
Then the page displays an empty state ("You haven't placed any orders yet.")
And provides a link to browse the catalog (`/catalog`).

### Scenario 3: Signed-in customer views detail of their own order
Given a signed-in customer and an order placed by this customer
When the customer navigates to `/account/orders/[reference]` (or requests `GET /api/account/orders/[reference]`)
Then the customer sees the full order detail:
  - Reference, date placed, status, fulfillment status
  - Itemized lines with product name, size, color, quantity, unit price in USD, and line total in USD
  - Delivery details with shipping address and shipping method
  - Financial breakdown with Subtotal, Shipping, Estimated Tax, and Total in USD
  - Link to return to `/account/orders`.

### Scenario 4: Cross-customer isolation (customer cannot access another customer's order)
Given Customer A and Customer B, each with their own orders
When Customer A requests `/account/orders/[reference_of_customer_b]`
Then the page calls Next.js `notFound()` (renders 404)
And `GET /api/account/orders/[reference_of_customer_b]` returns 404 Not Found
And Customer A never sees any data belonging to Customer B.

### Scenario 5: Signed-out visitor is barred from order history
Given a visitor without a valid `ja_account_session` cookie
When the visitor navigates to `/account/orders` or `/account/orders/[reference]`
Then they are redirected to `/account/signin` (with `returnUrl`)
And `GET /api/account/orders` or `GET /api/account/orders/[reference]` returns 401 Unauthorized.

### Scenario 6: Customer account navigation includes links to order history
Given a signed-in customer on `/account`
When the customer views the Account Overview page
Then the page includes an accessible link to `/account/orders`.
