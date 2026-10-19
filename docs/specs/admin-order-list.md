# Feature Implementation Spec: Admin lists all orders

## Source Feature

- `id`: `admin-order-list`
- `area`: `backoffice`
- `depends_on`: `["admin-role-gate", "order-creation-on-payment"]` (both accepted)
- `status`: `in_progress`
- `source`: `feature_list.json`

## Goal

Provide authenticated administrators with a read-only backoffice view of every order across all customers, along with a read-only detail view for any individual order by reference:
1. **Data Access Layer (`db/admin-orders.ts`):**
   - `listAllOrdersForAdmin(db)`: returns all orders across all customers/accounts ordered by `createdAt` descending (`id`, `reference`, `accountId`, `contactEmail`, `status`, `fulfillmentStatus`, `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, `currency`, `createdAt`, `paidAt`, `itemCount` as sum of line quantities, `lineCount`).
   - `getOrderForAdmin(db, reference)`: returns full order detail across any customer by `reference`, including frozen `lines`, `shippingAddress`, and `shippingMethod`, or `null` if not found.
2. **Backoffice API Route Handlers:**
   - `GET /api/admin/orders`: guarded by `getAdminSession()`. Returns 401 Unauthorized when unauthenticated, 403 Forbidden when authenticated without the `admin` role, and 200 OK `{ ok: true, orders }` for admins, with `Cache-Control: no-store`.
   - `GET /api/admin/orders/[reference]`: guarded by `getAdminSession()`. Returns 401/403 for unauthorized callers, 404 `{ ok: false, error: "Order not found." }` if the reference does not exist, and 200 OK `{ ok: true, order }` with full order details, with `Cache-Control: no-store`.
3. **Backoffice UI Routes:**
   - `/admin/orders` (`app/admin/orders/page.tsx`): Server Component guarded by `getAdminSession()`. Displays a table of all orders across all customers with columns for Order Reference (link to `/admin/orders/[reference]`), Date, Customer Email (`contactEmail`), Items (`itemCount`), Payment Status badge (`status`), Fulfillment Status badge (`fulfillmentStatus`), and Total (`formatPriceUSD(totalCents)`), plus a defined empty state when no orders exist.
   - `/admin/orders/[reference]` (`app/admin/orders/[reference]/page.tsx`): Read-only Server Component guarded by `getAdminSession()`. Calls `notFound()` if the reference does not exist. Displays order reference, date placed, customer email, payment status, fulfillment status, frozen order lines (product name, size, color, quantity, unit price, line total), financial summary (Subtotal, Shipping, Estimated Tax, Total in USD), shipping address, shipping method, and back link to `/admin/orders`.

## Non-Goals

- Fulfillment state transitions (`preparing`, `shipped`, `delivered`) — handled in `admin-order-fulfillment`.
- Order cancellation, editing, or refund processing (out of MVP scope).
- Customer-facing order tracking portal (excluded by `docs/mvp-scope.md`).

## Acceptance Scenarios

### Scenario 1: Admin sees orders across all customers
Given orders placed by multiple distinct customer accounts (e.g., Customer A and Customer B)
When an authenticated admin views `/admin/orders` (or calls `GET /api/admin/orders`)
Then every order from all customers is listed in descending `createdAt` order, not just orders belonging to the admin's own account
And each row shows the order reference, customer contact email, item count, payment status, fulfillment status, and frozen total formatted in USD via `formatPriceUSD`.

### Scenario 2: Empty state when no orders have been placed
Given a database with no orders
When an authenticated admin views `/admin/orders`
Then the page renders a clear empty state indicating that no orders have been placed yet.

### Scenario 3: Admin opens read-only detail for any customer's order
Given an order placed by any customer
When an authenticated admin navigates to `/admin/orders/[reference]` (or calls `GET /api/admin/orders/[reference]`)
Then the admin sees the complete read-only order snapshot: reference, customer email, payment status, fulfillment status, frozen line items (product name, size, color, quantity, unit price, line total), shipping address, shipping method, and financial breakdown (Subtotal, Shipping, Estimated Tax, Total in USD).

### Scenario 4: Unknown order reference returns 404
Given an authenticated admin
When requesting `/admin/orders/JA-999999` or `GET /api/admin/orders/JA-999999` for a non-existent reference
Then the page calls Next.js `notFound()` and the API returns HTTP 404 `{ ok: false, error: "Order not found." }`.

### Scenario 5: Non-admin and unauthenticated visitors are barred
Given an unauthenticated visitor or a signed-in customer without the `admin` role
When requesting `/admin/orders`, `/admin/orders/[reference]`, `GET /api/admin/orders`, or `GET /api/admin/orders/[reference]`
Then unauthenticated requests receive 401 (API) or redirect to `/account/signin` (UI)
And non-admin customer requests receive 403 Forbidden.
