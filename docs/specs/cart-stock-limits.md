# Feature Implementation Spec: Cart respects available stock

## Source Feature

- `id`: `cart-stock-limits`
- `area`: `shopping`
- `depends_on`: `["guest-cart-manage"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Ensure the guest cart respects available inventory stock across all interactions:
1. Prevent adding a quantity that would cause the cart line to exceed available stock (`POST /api/cart/lines`), presenting clear feedback to the shopper on the product page.
2. In the product detail page `AddToCart` control, cap the quantity dropdown by the selected variant's `stockQty` (up to `MAX_ADD_QUANTITY = 10`), and render user-friendly stock error messages if a requested add exceeds available stock (e.g. "Only X items available in stock.").
3. In `/cart`, disable the quantity increment (`+`) stepper button when the line's quantity reaches available stock (or the system cap of 10).
4. Prevent updating a line's quantity beyond available stock (`PATCH /api/cart/lines`), returning HTTP 400 with `stock_exceeded` and available quantity.
5. When a shopper views `/cart`, if variant stock has dropped below a cart line's quantity (due to concurrent purchases or inventory reduction), automatically clamp the line's quantity to available stock (or delete the line if available stock is 0), and visibly flag the adjustment with a clear notice so the shopper is informed before checkout proceeds.

## Non-Goals

- Concurrency stock reservation during checkout / payment (owned by `stock-reservation` at order placement time).
- Backorder support, pre-orders, or waitlist notifications (out of MVP scope).
- Admin inventory management UI (owned by backoffice features).

## Job Story

When I am adding items to my cart or reviewing my cart before checkout,
I want the cart to enforce and reflect actual inventory limits,
so I am never led to believe I can buy more than what is available, and any quantity reductions due to stock changes are clearly explained before I proceed to pay.

## Users And Permissions

- **Guest (anonymous shopper):** interacts with their session cart via `ja_cart_session` cookie. Stock limits are verified against the variant's current `stockQty` in the database.
- **Session Isolation:** stock validation and quantity adjustments apply strictly within the caller's session cart without leaking details of other sessions.

## Acceptance Scenarios

### Scenario 1: Add to cart is bounded by variant stock on product page
Given a product variant with `stockQty = 3`
When the shopper selects this variant on the product page
Then the quantity selector displays options up to 3 (capped at `min(10, stockQty)`).

### Scenario 2: Repeat add exceeding remaining stock is rejected with user-friendly error
Given a guest cart with 2 units of a variant having `stockQty = 3`
When the shopper attempts to add 2 more units of the same variant
Then the server rejects the request with HTTP 400 (`code: "stock_exceeded"`, `available: 3`)
And the product page displays: "Only 3 items available in stock." (or "Only 3 items available in stock.").
And no new cart or cookie is erroneously minted if the request was unauthenticated.

### Scenario 3: Stepper increment disabled when quantity reaches available stock
Given a cart line with quantity 3 for a variant having `stockQty = 3`
When the shopper views `/cart`
Then the `+` stepper button for that line is disabled
And the shopper cannot increment past 3.

### Scenario 4: Direct PATCH API call exceeding stock returns 400 stock_exceeded
Given an existing cart line with quantity 2 for a variant with `stockQty = 2`
When a client sends `PATCH /api/cart/lines` with `{ lineId, quantity: 3 }`
Then the API responds with HTTP 400 (`code: "stock_exceeded"`, `available: 2`)
And the line quantity in the database remains unchanged at 2.

### Scenario 5: Viewing cart automatically clamps quantity when stock has dropped and shows visible warning
Given a guest cart line with quantity 4 for a variant whose stock was reduced to 2
When the shopper views `/cart`
Then the cart automatically clamps the line quantity to 2 in the database
And recalculates the line total and cart subtotal based on quantity 2
And the line visibly displays an adjustment warning: "Quantity adjusted to 2 based on available stock."
And the `+` stepper button is disabled because quantity equals available stock (2).

### Scenario 6: Viewing cart handles variant that is completely out of stock (stock = 0)
Given a guest cart line for a variant whose stock dropped to 0
When the shopper views `/cart`
Then the out-of-stock line is removed from the cart in the database
And the cart displays a notification informing the shopper that the item was out of stock and removed
And the cart subtotal updates accordingly (or transitions to empty cart if no lines remain).

### Scenario 7: Baseline gate and build pass
Given all implementation and tests for `cart-stock-limits`
When running `CI=true ./init.sh` and `pnpm build`
Then all tests pass and the production build completes successfully.

## Technical Approach

1. **Database Layer (`db/cart.ts`)**:
   - `AddVariantResult`: extend to include `| { ok: false; reason: "stock_exceeded"; available: number }`.
   - `addVariantToCart`:
     - Inspect `addable.stockQty`.
     - Check if the caller's session cart already has a line for `variantId`.
     - If `(existingQuantity + quantity) > addable.stockQty`, return `{ ok: false, reason: "stock_exceeded", available: addable.stockQty }` without creating a new cart or updating rows.
   - `UpdateCartLineResult`: extend to include `| { ok: false; reason: "stock_exceeded"; available: number }`.
   - `updateCartLineQuantity`:
     - Join `cartLine` with `variant` to check `variant.stockQty`.
     - If `quantity > variant.stockQty`, return `{ ok: false, reason: "stock_exceeded", available: variant.stockQty }`.
   - `CartSummaryLine`: include `availableStock: number` and `stockAdjusted?: boolean`.
   - `CartSummary`: include `notifications?: string[]`.
   - `getCartSummary`:
     - Select `variant.stockQty` along with cart line fields.
     - Detect lines where `quantity > stockQty` or `stockQty <= 0`.
     - In a transaction, clamp lines with `quantity > stockQty > 0` to `stockQty`, delete lines with `stockQty <= 0`, and touch `cart.updatedAt`.
     - Mark clamped lines with `stockAdjusted: true` and populate `notifications`.
     - Return updated lines and recalculate `subtotalCents`.

2. **API Layer (`app/api/cart/lines/route.ts`)**:
   - In `POST`: if `result.reason === "stock_exceeded"`, return HTTP 400 with `{ error: "Only X items available in stock.", code: "stock_exceeded", available: result.available }`.
   - In `PATCH`: if `result.reason === "stock_exceeded"`, return HTTP 400 with `{ error: "Only X items available in stock.", code: "stock_exceeded", available: result.available }`.

3. **Product Page UI (`app/products/[slug]/add-to-cart.tsx`)**:
   - Cap quantity select options to `Math.min(MAX_ADD_QUANTITY, Math.max(1, variant.stockQty))` when a variant is selected.
   - Clamp selected quantity if switching to a variant with lower stock.
   - Render server error message if returned from `POST /api/cart/lines` (`stock_exceeded`).

4. **Cart UI (`app/cart/`)**:
   - In `CartLineRow` (`app/cart/cart-line-row.tsx`):
     - Cap stepper increment at `Math.min(10, line.availableStock ?? 10)`.
     - Disable `+` button when `line.quantity >= Math.min(10, line.availableStock ?? 10)`.
     - Render warning when `line.stockAdjusted` is true.
   - In `CartPage` (`app/cart/page.tsx`):
     - Render cart-level notifications if `summary.notifications` contains messages.
   - In `app/globals.css`:
     - Add styling for `.cart__line-stock-warning` and `.cart__notifications`.

## Verification Plan

- `db/tests/cart-stock-limits.test.ts`: test `addVariantToCart` stock checks, `updateCartLineQuantity` stock checks, and `getCartSummary` auto-clamp and out-of-stock removal.
- `app/api/cart/lines/route.test.ts`: test `POST` and `PATCH` handling of `stock_exceeded` responses (400 status, JSON body, cache headers, no cookie creation).
- `app/products/[slug]/add-to-cart.test.tsx`: test quantity dropdown capping and stock exceeded error display.
- `app/cart/cart-line-row.test.tsx`: test increment button disabled when quantity equals available stock, and rendering of stock adjustment notice.
- `app/cart/page.test.tsx`: test rendering of cart notifications and adjusted lines.
- `CI=true ./init.sh`: lint, typecheck, and all test suites pass.
- `pnpm build`: Next.js production build succeeds.
