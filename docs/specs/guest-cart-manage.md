# Feature Implementation Spec: Guest edits quantities and removes cart lines

## Source Feature

- `id`: `guest-cart-manage`
- `area`: `shopping`
- `depends_on`: `["guest-cart-add"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide interactive quantity controls and line removal for the guest shopping cart at `/cart`. A shopper can increase or decrease the quantity of any line (bounded 1 to 10 per line), or remove a line entirely. As changes occur, each line total and the cart subtotal recalculate immediately. If all items are removed, the cart renders the empty state. All updates are persisted in the database against the shopper's `ja_cart_session` cookie so that the cart survives page reloads.

## Non-Goals

- Capping quantities against available inventory stock or reserving stock (owned by `cart-stock-limits` and `stock-reservation`).
- Checkout, shipping methods, taxes, order placement, or payments (owned by subsequent checkout features).
- Cart drawer, header cart badge counter, undo toast, or saved-for-later/wishlist features.
- Any database schema changes or migrations (`cart` and `cart_line` tables already support updates and deletions).

## Job Story

When I am reviewing my shopping cart before checking out,
I want to adjust the quantity of items or remove items I no longer want,
so my cart accurately reflects what I intend to purchase and the subtotal updates immediately.

## Users And Permissions

- **Guest (anonymous shopper):** can adjust quantities and remove lines exclusively within their own session cart identified by the httpOnly `ja_cart_session` cookie.
- **Session Isolation:** the server verifies that any modified or deleted `lineId` belongs to the active cart associated with the request's `ja_cart_session` token. Callers cannot mutate lines belonging to other shoppers.

## Acceptance Scenarios

### Scenario 1: Increasing line quantity updates line total and cart subtotal
Given a guest cart with 1 unit of `Double-Breasted Linen Blazer` ($249.00)
When the shopper clicks the `+` stepper button for that item
Then the line quantity updates to 2, the line total displays $498.00, and the cart subtotal displays $498.00.

### Scenario 2: Decreasing line quantity down to 1
Given a guest cart with 2 units of `Double-Breasted Linen Blazer` ($498.00)
When the shopper clicks the `-` stepper button
Then the line quantity updates to 1, the line total displays $249.00, and the cart subtotal displays $249.00.
And when quantity is 1, the `-` stepper button is disabled (minimum quantity is 1; explicit removal uses the Remove button).

### Scenario 3: Stepper upper bound is 10
Given a guest cart line with quantity 10
When the shopper views the stepper
Then the `+` button is disabled (maximum per line is 10 in this slice).

### Scenario 4: Removing a line removes it and updates subtotal
Given a guest cart with two distinct lines (Line A $249.00 and Line B $180.00, subtotal $429.00)
When the shopper clicks "Remove" on Line B
Then Line B is removed from the cart list, and the subtotal updates to $249.00.

### Scenario 5: Removing the last item shows empty cart state
Given a guest cart with exactly 1 line
When the shopper clicks "Remove" on that line
Then the cart transitions to the empty cart state: "Your cart is empty." with the "Continue shopping" link to `/catalog`.

### Scenario 6: Changes persist across page reload
Given a shopper has changed a line quantity to 3 and removed another line
When the shopper reloads `/cart`
Then the cart displays the updated quantity 3 and the remaining lines with matching totals from the database.

### Scenario 7: Security and session isolation
Given a request to `PATCH` or `DELETE` a cart line with a `lineId` that does not belong to the caller's session cart (or an invalid UUID)
When the API handler processes the request
Then it returns HTTP 404 (or 400) and makes no changes to any database row.

## Repository Research

### Files Inspected

- `db/cart.ts` — existing cart repository with `getOrCreateCart`, `addVariantToCart`, and `getCartSummary`.
- `db/schema/cart.ts` and `db/schema/cart-line.ts` — schema definitions with `(cartId, variantId)` uniqueness and FK to `cart.id`.
- `app/api/cart/lines/route.ts` — existing `POST /api/cart/lines` handler enforcing JSON, cookie-only session auth, and `revalidatePath("/cart")`.
- `app/cart/session.ts` — helper for reading and setting `ja_cart_session`.
- `app/cart/page.tsx` — current server-component rendering the cart.
- `app/globals.css` — styling tokens (`.cart*` classes, zero radius, ink buttons).
- `stitch_image_based_application/carrito_pasarela_de_pago_simulada/code.html` — design reference for quantity steppers and delete action.

### Existing Patterns To Follow

- Money is integer cents, formatted with `formatPriceUSD`.
- Route handlers return `Cache-Control: no-store` on all mutating responses.
- Session identity is exclusively derived from the `ja_cart_session` cookie; no cart or session tokens are accepted from request bodies.
- Vitest suites cover DB repository methods (`db/tests/`) and UI components (`app/cart/`).

## Technical Approach

1. **Database Layer (`db/cart.ts`)**:
   - `updateCartLineQuantity(db, sessionToken, lineId, quantity)`: Updates `cart_line.quantity` where `id = lineId` and `cartId = cart.id` (matching `sessionToken`). Updates `cart.updatedAt`.
   - `removeCartLine(db, sessionToken, lineId)`: Deletes `cart_line` where `id = lineId` and `cartId = cart.id` (matching `sessionToken`). Updates `cart.updatedAt`.
2. **API Layer (`app/api/cart/lines/route.ts`)**:
   - Add `PATCH`: accepts JSON `{ lineId, quantity }` (validates UUID and integer 1–10). Calls `updateCartLineQuantity`. Revalidates `/cart`.
   - Add `DELETE`: accepts JSON `{ lineId }` (validates UUID). Calls `removeCartLine`. Revalidates `/cart`.
3. **Cart UI (`app/cart/`)**:
   - Extract interactive line row into a Client Component (e.g. `app/cart/cart-line-row.tsx`) with `-` and `+` steppers and a `Remove` button.
   - Stepper communicates changes via `PATCH /api/cart/lines` and `DELETE /api/cart/lines`.
   - While pending, buttons are disabled to prevent duplicate submissions.
   - Refreshes router / triggers Next.js server revalidation so subtotal updates seamlessly.
4. **CSS Tokens**:
   - Add minimal `.cart__stepper`, `.cart__stepper-btn`, `.cart__stepper-qty`, and `.cart__remove-btn` styled according to `DESIGN.md` (zero radius, hairline borders, monospace/caps where appropriate, high contrast).

## Expected File Changes

- `db/cart.ts` — modify: add `updateCartLineQuantity` and `removeCartLine`.
- `db/tests/guest-cart-manage.test.ts` — create: test update, remove, non-existent line, and session isolation.
- `app/cart/cart-input.ts` — modify: add validation for `lineId` and update payloads.
- `app/cart/cart-input.test.ts` — modify: test line update/remove payload validators.
- `app/api/cart/lines/route.ts` — modify: add `PATCH` and `DELETE` methods.
- `app/api/cart/lines/route.test.ts` — modify: test `PATCH` and `DELETE` happy paths, bounds, and isolation.
- `app/cart/cart-line-row.tsx` — create: client component with stepper buttons and remove button.
- `app/cart/cart-line-row.test.tsx` — create: tests for stepper clicks, disabled states, and remove trigger.
- `app/cart/page.tsx` — modify: render `CartLineRow` for each line item.
- `app/cart/page.test.tsx` — modify: update tests to verify steppers and remove actions appear.
- `app/globals.css` — modify: add styling for steppers and remove button.
- `ARCHITECTURE.md` — modify: document `PATCH` and `DELETE` on `/api/cart/lines`.
- `feature_list.json` — modify: update `guest-cart-manage` status and verification evidence.
- `PROGRESS.md` — modify: record session log.

## Visual Design Impact

- UI involved: yes.
- Design source: `stitch_image_based_application/carrito_pasarela_de_pago_simulada/` & `DESIGN.md`.
- Elements:
  - Stepper: `[-] [ qty ] [+]` with sharp corners, hairline borders, accessible `aria-label`s.
  - Remove button: text button "Remove" or icon with clear label.
  - Responsive: layout aligns nicely with unit price and line total on mobile and desktop.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update mutating route surface to include `PATCH /api/cart/lines` and `DELETE /api/cart/lines`.
- `CONSTRAINTS.md`: not needed (Rule 10 on guest cart already covers server-side session resolution).
- `AGENTS.md`: not needed.

## Implementation Tasks

- [ ] Add `updateCartLineQuantity` and `removeCartLine` in `db/cart.ts` with integration tests in `db/tests/guest-cart-manage.test.ts`.
- [ ] Add payload validation in `app/cart/cart-input.ts` with unit tests.
- [ ] Implement `PATCH` and `DELETE` in `app/api/cart/lines/route.ts` with route tests in `app/api/cart/lines/route.test.ts`.
- [ ] Create `app/cart/cart-line-row.tsx` client component with steppers, remove button, and loading states.
- [ ] Integrate `CartLineRow` into `app/cart/page.tsx` and style in `app/globals.css`.
- [ ] Write component tests in `app/cart/cart-line-row.test.tsx` and update `app/cart/page.test.tsx`.
- [ ] Run `./init.sh` to ensure all tests pass.
- [ ] Update `feature_list.json`, `PROGRESS.md`, and `ARCHITECTURE.md`.

## Verification Plan

- `./init.sh`: all lints, typechecks, and tests pass.
- Automated tests:
  - Unit tests for input parsing (UUID, quantity 1–10).
  - DB integration tests for update, delete, cascade, and session isolation.
  - Route tests for `PATCH` and `DELETE` HTTP responses.
  - React testing-library tests for stepper interactions and remove triggers.
- Live dev server verification on port 3002:
  - Add items to cart.
  - Increment and decrement quantities; assert subtotal updates.
  - Remove items; assert item is deleted and empty state appears when all removed.
  - Reload page; assert state is preserved.

## Evidence To Capture

- `./init.sh` exit 0 output.
- Focused Vitest test results for cart manage suites.
- Live HTTP/UI verification transcript.

## Validator Checklist

- [ ] Stepper allows quantity 1 to 10; `-` disabled at 1, `+` disabled at 10.
- [ ] Removing line deletes it from the database and updates cart subtotal.
- [ ] Removing all lines transitions to empty cart state.
- [ ] Session isolation: user cannot edit or delete another session's cart lines.
- [ ] Reloading the page retains all changes.
- [ ] No regression in existing tests; `./init.sh` passes.
