# Feature Implementation Spec: Admin moves an order through fulfillment

## Source Feature

- `id`: `admin-order-fulfillment`
- `area`: `backoffice`
- `depends_on`: `["admin-order-list"]`
- `status`: `in_progress`
- `source`: `feature_list.json`

## Goal

Provide authenticated administrators with the ability to transition a paid order through the sequential fulfillment lifecycle (`unfulfilled` -> `preparing` -> `shipped` -> `delivered`), while strictly rejecting invalid transitions or attempts to fulfill unpaid orders. Customers immediately see the updated fulfillment status in their account order history (`/account/orders`) and order detail (`/account/orders/[reference]`).

1. **State Machine & Data Layer (`db/admin-orders.ts`):**
   - Define strictly sequential fulfillment transitions:
     - `unfulfilled` -> `preparing`
     - `preparing` -> `shipped`
     - `shipped` -> `delivered`
     - `delivered` is terminal (no further transitions).
   - `updateOrderFulfillmentStatus(db, reference, newFulfillmentStatus)`:
     - Returns `{ ok: false, error: "not_found" }` if order does not exist.
     - Returns `{ ok: false, error: "order_not_paid" }` if order payment status is not `paid`.
     - Returns `{ ok: false, error: "invalid_transition" }` if target status does not match the valid next state in sequence (e.g. skipping from `unfulfilled` to `delivered` or moving backwards from `shipped` to `preparing`).
     - Updates `order.fulfillmentStatus = newFulfillmentStatus` and `order.updatedAt = new Date()`.
     - Returns `{ ok: true, order }` with the updated full admin order detail.
   - Helper `getNextFulfillmentStatus(current)`: returns the next valid fulfillment status or `null` if terminal.

2. **Backoffice Route Handler (`app/api/admin/orders/[reference]/fulfillment/route.ts`):**
   - Accepts `PATCH` and `POST`.
   - Guarded by `getAdminSession()`:
     - 401 Unauthorized for unauthenticated callers.
     - 403 Forbidden for authenticated callers without the `admin` role.
   - Parses `{ fulfillmentStatus }` from request body; returns 400 Bad Request if missing or invalid.
   - Calls `updateOrderFulfillmentStatus(db, reference, fulfillmentStatus)`.
   - Returns:
     - 404 Not Found if order reference does not exist.
     - 400 Bad Request if order is not paid or if transition is invalid.
     - 200 OK `{ ok: true, order }` with `Cache-Control: no-store` on success.

3. **Backoffice UI (`app/admin/orders/[reference]/page.tsx` & `fulfillment-controls.tsx`):**
   - Displays current fulfillment status badge alongside payment status.
   - Dedicated "Order Fulfillment" card/section:
     - If the order is not paid (e.g. pending/failed/cancelled), renders a clear notice that fulfillment only applies once the order is paid.
     - If the order is paid, renders visual fulfillment stage indicator and an action button to advance to the next valid fulfillment status (e.g. "Advance to Preparing", "Advance to Shipped", "Advance to Delivered").
     - If the order is delivered, renders confirmation that fulfillment is complete with no advance buttons.
     - Disables button and displays loading state during transition request; displays an inline error alert if the request fails.
     - Refreshes data on success.

4. **Customer Storefront Reflection (`app/account/orders` & `app/account/orders/[reference]`):**
   - Queries already display `order.fulfillmentStatus`.
   - Verify that advancing fulfillment in the backoffice immediately updates customer-facing order history and order detail views.

## Non-Goals

- Order cancellation after shipping (out of MVP scope per `docs/domain-model.md`).
- Multi-carrier shipment tracking integration or webhook tracking ingestion (out of MVP scope per `docs/mvp-scope.md`).
- Customer returns or return shipping labels (out of MVP scope).

## Acceptance Scenarios

### Scenario 1: Admin advances paid order sequentially
Given an order with `status: "paid"` and `fulfillmentStatus: "unfulfilled"`
When an authenticated admin advances the fulfillment status
Then the status moves to `preparing`
When the admin advances again
Then the status moves to `shipped`
When the admin advances again
Then the status moves to `delivered`
And at each step, `order.fulfillmentStatus` is updated in the database and reflected in the admin order detail.

### Scenario 2: Invalid transitions are rejected
Given an order with `status: "paid"` and `fulfillmentStatus: "unfulfilled"`
When attempting to transition directly to `shipped` or `delivered`
Then the transition is rejected with `invalid_transition` (HTTP 400)
And given an order with `fulfillmentStatus: "shipped"`
When attempting to move backwards to `preparing` or `unfulfilled`
Then the transition is rejected with `invalid_transition` (HTTP 400)
And given an order with `fulfillmentStatus: "delivered"`
When attempting any further transition
Then the transition is rejected with `invalid_transition` (HTTP 400).

### Scenario 3: Fulfilling an unpaid order is rejected
Given an order with `status: "pending"` (or cancelled / refunded) and `fulfillmentStatus: "unfulfilled"`
When attempting to update fulfillment status to `preparing`
Then the transition is rejected with `order_not_paid` (HTTP 400)
And the database record remains unchanged.

### Scenario 4: Customer sees updated fulfillment state in order history
Given a customer who placed an order
When an admin advances the order fulfillment status to `preparing`, `shipped`, or `delivered`
Then the customer viewing `/account/orders` sees the updated fulfillment badge ("Preparing", "Shipped", or "Delivered")
And viewing `/account/orders/[reference]` shows the corresponding updated fulfillment status badge.

### Scenario 5: Access control protects fulfillment transitions
Given an unauthenticated visitor or an authenticated user lacking the `admin` role
When attempting to call `PATCH /api/admin/orders/[reference]/fulfillment`
Then unauthenticated requests receive HTTP 401 Unauthorized
And non-admin authenticated users receive HTTP 403 Forbidden
And no database updates occur.

### Scenario 6: Unknown order reference returns 404
Given an authenticated admin
When attempting to update fulfillment on a non-existent reference `JA-999999`
Then the endpoint returns HTTP 404 `{ ok: false, error: "Order not found." }`.
