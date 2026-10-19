# Feature Implementation Spec: Shopper chooses a shipping method and sees its cost

## Source Feature

- `id`: `checkout-shipping-method`
- `area`: `checkout`
- `depends_on`: `["checkout-contact-and-address"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide Step 2 of the checkout flow at `/checkout` where the shopper selects a shipping method for their delivery from the seeded options (Standard Shipping: $0.00 / Free, 3–5 business days; Express Shipping: $15.00, 1–2 business days).
The selected shipping method is persisted to `checkout_session.shipping_method_id` tied to the active cart session. Step 2 shows a completed summary card with a "Modify" control, the Order Summary updates the shipping line and the total, and Step 3 ("Payment") readiness indicator is displayed.

## Non-Goals

- Collecting contact email or shipping address (completed in `checkout-contact-and-address`).
- Calculating destination-based sales tax on subtotal/shipping (owned by `checkout-sales-tax`).
- Executing payment transactions and creating placed orders (owned by `payment-provider-abstraction` and `order-creation-on-payment`).
- Real credit card processing or live courier rate APIs (UPS, FedEx, USPS) — flat standard and express rates are modeled.
- Cross-border shipping or international destinations (US domestic only).

## Job Story

When I have entered my contact details and delivery address at checkout,
I want to choose among available shipping methods and see each method's delivery expectation and price,
so that I can select how fast my order arrives and see the updated shipping cost and total in my order summary before paying.

## Users And Permissions

- **Guest Shopper:** can view available shipping methods, select a method, submit the selection, and modify their selection.
- **Session Isolation:** the active cart is resolved exclusively from the httpOnly `ja_cart_session` cookie. Shoppers cannot query or update another session's shipping method.
- **Prerequisite Enforcement:** Step 2 cannot be submitted unless Step 1 (contact email and shipping address) has been completed for the current checkout session.

## Acceptance Scenarios

### Scenario 1: Step 2 pending/locked when Step 1 is incomplete
Given a guest shopper on `/checkout` with a non-empty cart where contact email and shipping address (Step 1) have not been saved
When the checkout page renders
Then Step 2 ("Shipping Method") is displayed in an inactive/pending state ("Pending Step 1") with method selection locked/disabled.

### Scenario 2: Available shipping methods rendered with cost and delivery expectation
Given a guest on `/checkout` whose contact email and shipping address have been saved (Step 1 complete)
When Step 2 renders
Then all available shipping methods from the database are listed as selectable radio options
And each option clearly displays:
  - Name (e.g. "Standard Shipping", "Express Shipping")
  - Delivery expectation (e.g. "3–5 business days", "1–2 business days")
  - Formatted cost ($0.00 / Free for Standard, $15.00 for Express via `formatPriceUSD`).

### Scenario 3: Selecting and saving a shipping method
Given a guest on `/checkout` with Step 1 complete and shipping methods displayed
When the shopper selects a shipping method (e.g., "Standard Shipping") and clicks "Continue to Payment"
Then the selection is saved to the database (`checkout_session.shipping_method_id`)
And Step 2 transitions to a completed summary card displaying:
  - Chosen shipping method name
  - Delivery estimate
  - Formatted cost
  - A "Modify" button to edit the selection
And Step 3 ("Payment") is highlighted as ready.

### Scenario 4: Order Summary reflects chosen method cost and updates total
Given a guest cart with a subtotal (e.g., $249.00)
When no shipping method is selected yet
Then the Order Summary displays the Shipping line as "Calculated next step" and Total equal to subtotal
When the shopper selects Standard Shipping ($0.00) and saves
Then the Order Summary displays Shipping as "$0.00" (or Free) and Total as "$249.00"
When the shopper changes or selects Express Shipping ($15.00)
Then the Order Summary updates Shipping to "$15.00" and Total to "$264.00" ($249.00 + $15.00).

### Scenario 5: Modifying shipping method choice
Given a shopper has previously selected a shipping method and sees the Step 2 summary card
When they click "Modify" on Step 2
Then the shipping options re-open with their current selection pre-selected
And when they switch to a different shipping method and confirm
Then the updated selection is saved to the checkout session, the summary card reflects the updated method, and the Order Summary immediately updates.

### Scenario 6: Persistence across reloads and navigation
Given a shopper has completed Step 1 and selected a shipping method in Step 2
When the shopper refreshes `/checkout` or navigates to `/cart` and returns to `/checkout`
Then both Step 1 and Step 2 remain in completed summary states with the saved values
And the Order Summary retains the selected shipping cost and calculated total.

### Scenario 7: Session isolation & API validation
Given requests to `POST /api/checkout/shipping-method`
When a request lacks an active cart session cookie
Then the API responds with 400 Bad Request
When a request provides an invalid or non-existent `shippingMethodId`
Then the API responds with 400 Bad Request
When a request is made for a cart session that has not completed Step 1
Then the API responds with 400 Bad Request ("Please complete contact and shipping address first.")
And all API responses include `Cache-Control: no-store`.

## Technical Plan

1. **Database Schema & Repository (`db/schema/order.ts`, `db/checkout.ts`):**
   - Added `shippingMethodId` column referencing `shipping_method(id)` to `checkout_session`.
   - Migration `0003_freezing_vargas.sql` generated and applied.
   - Add `listShippingMethods(db)` returning shipping methods ordered by `costCents ASC`.
   - Update `getCheckoutSession(db, sessionToken)` to join `shipping_method` so the selected method details are returned with the session.
   - Add `saveCheckoutShippingMethod(db, sessionToken, shippingMethodId)` verifying active cart and existing checkout session before updating `shipping_method_id` and `updated_at`.

2. **API Endpoint (`app/api/checkout/shipping-method/route.ts`):**
   - `POST`: Validates JSON body with `{ shippingMethodId: string }`, verifies active cart session cookie, ensures address is already saved, validates shipping method exists, calls `saveCheckoutShippingMethod`, calls `revalidatePath('/checkout')`, returns updated checkout session with `Cache-Control: no-store`.
   - `GET`: Returns list of available shipping methods and current checkout shipping selection.

3. **Checkout UI (`app/checkout/`):**
   - Create `app/checkout/shipping-method-form.tsx` (client component or integrated into checkout flow).
   - Alternatively, coordinate Step 1 and Step 2 cleanly:
     - `ContactAndAddressForm` handles Step 1.
     - `ShippingMethodForm` handles Step 2 (selectable radio group, submit button, completed summary card, Modify button).
     - Or a unified `CheckoutFlow` component that coordinates Step 1, Step 2, and displays Step 3 readiness.
   - Update `CheckoutPage` in `app/checkout/page.tsx`:
     - Load `shippingMethods` via `listShippingMethods(db)`.
     - Read `checkoutSession` (now includes `selectedShippingMethod`).
     - Render Order Summary with dynamic `shippingCostCents` and `totalCents = subtotalCents + shippingCostCents`.

4. **Styling (`app/globals.css`):**
   - Radio option cards for shipping methods (`.checkout-shipping-options`, `.checkout-shipping-option`, `.checkout-shipping-option--selected`).
   - Clean badges, delivery estimates, prices, and focus/hover states matching J. Armando brand aesthetic.

5. **Testing & Verification:**
   - DB tests in `db/tests/checkout-shipping-method.test.ts`.
   - Route tests in `app/api/checkout/shipping-method/route.test.ts`.
   - UI tests in `app/checkout/shipping-method-form.test.tsx` and updated `app/checkout/page.test.tsx`.
   - Run `CI=true ./init.sh` and `pnpm build`.
