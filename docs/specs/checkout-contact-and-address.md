# Feature Implementation Spec: Shopper enters contact email and shipping address at checkout

## Source Feature

- `id`: `checkout-contact-and-address`
- `area`: `checkout`
- `depends_on`: `["guest-cart-manage"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide the first step of checkout at `/checkout` where the shopper provides their contact email and shipping address (Recipient Full Name, Address Line 1, Address Line 2 / Suite optional, City, State/Province, Postal/ZIP Code, Country fixed to US, and Phone optional).
Submitting valid contact and address data validates all fields, associates the information with the active guest session cart, and advances the checkout flow to show a completed summary card for Step 1 with a "Modify" / "Edit" control, while highlighting Step 2 ("Shipping Method") as ready. Missing or invalid required fields show clear inline validation errors and do not advance.

## Non-Goals

- Shipping method selection or cost calculations (owned by `checkout-shipping-method`).
- Sales tax calculation based on state/ZIP (owned by `checkout-sales-tax`).
- Simulated payment execution and paid order creation (owned by `payment-provider-abstraction` and `order-creation-on-payment`).
- Automatic account creation with password hashing at payment time (owned by `account-created-at-payment`).
- Real credit card processing or external payment gateways (explicitly excluded in MVP scope).

## Job Story

When I am ready to purchase the items in my shopping cart,
I want to enter my contact email and delivery address with inline validation,
so that my order can be identified, taxed, and shipped accurately, and I can advance to choose a shipping method.

## Users And Permissions

- **Guest Shopper:** can initiate checkout from `/cart`, fill out contact email and shipping address, and submit them. The checkout state is securely tied to the guest's opaque `ja_cart_session` cookie.
- **Session Isolation:** the server resolves the cart exclusively from the httpOnly `ja_cart_session` cookie. Shoppers cannot view, modify, or hijack another session's checkout data.

## Acceptance Scenarios

### Scenario 1: Navigate from Cart to Checkout
Given a guest cart with at least one item
When the shopper visits `/cart`
Then they see a "Proceed to Checkout" link/button
And clicking "Proceed to Checkout" navigates to `/checkout`.

### Scenario 2: Empty cart handling on `/checkout`
Given a guest with no active cart or an empty cart
When they visit `/checkout`
Then they see an empty cart message with a link to browse the catalog ("Continue shopping" linking to `/catalog`), and no checkout form is displayed.

### Scenario 3: Submitting valid contact email and shipping address advances checkout
Given a guest on `/checkout` with an active non-empty cart
When the shopper enters valid details:
  - Contact Email: `alexandra.vance@studio.com`
  - Recipient Full Name: `Alexandra Vance`
  - Address Line 1: `123 Main Street`
  - Address Line 2: `Suite 4B`
  - City: `New York`
  - State: `NY`
  - Postal/ZIP Code: `10001`
  - Country: `US` (United States)
  - Phone: `+1 555-019-2834`
And submits the form
Then the form submits to the server, validates all fields, and persists the contact and address data associated with the session cart
And the UI advances: Step 1 transitions to a completed summary card showing the entered email, recipient name, and formatted address, with a "Modify" / "Edit" button
And Step 2 ("Shipping Method") is surfaced as the next active step.

### Scenario 4: Missing required fields show inline validation and do not advance
Given a guest on `/checkout`
When the shopper attempts to submit the form with one or more required fields empty (e.g. empty email, empty recipient name, empty line1, empty city, empty state, or empty zip)
Then inline validation error messages appear for the missing required fields:
  - Email: "Email is required"
  - Recipient Full Name: "Recipient full name is required"
  - Address Line 1: "Street address is required"
  - City: "City is required"
  - State: "State is required"
  - Postal/ZIP Code: "ZIP code is required"
And the form does not advance to the next step
And no invalid checkout state is persisted.

### Scenario 5: Format validation for email, state, and ZIP code
Given a guest on `/checkout`
When the shopper enters an invalid email format (e.g. `invalid-email`), an invalid US state (e.g. `XX`), or an invalid ZIP code (e.g. `123`)
Then inline validation error messages appear:
  - "Please enter a valid email address"
  - "Please enter a valid 2-letter US state code"
  - "Please enter a valid US ZIP code (e.g. 10001 or 10001-1234)"
And the form does not advance.

### Scenario 6: Contact and address persist across page reload
Given a shopper has submitted valid contact and shipping address data
When the shopper refreshes `/checkout` or navigates back to `/cart` and returns to `/checkout`
Then the checkout retains the contact email and shipping address, displaying the completed summary state for Step 1.

### Scenario 7: Modifying / Editing existing contact and shipping address
Given a shopper has previously submitted contact and shipping address data and sees the summary card
When they click "Modify" or "Edit" on Step 1
Then the form re-opens with their previously submitted values pre-populated
And when they update a field (e.g., change Address Line 1 to `456 Broadway`) and submit
Then the updated data is saved and the summary card reflects the updated address.

### Scenario 8: Session isolation and security
Given a request to persist checkout contact and address without an active cart or with forged input
Then the server resolves the cart strictly from the `ja_cart_session` cookie
And requests with no session or invalid inputs return HTTP 400 and make no database changes.

## Repository Research

### Files Inspected

- `db/schema/cart.ts` — `cart` and `cartLine` schemas.
- `db/schema/order.ts` — `order`, `orderLine`, `shippingMethod`, `payment` schemas.
- `db/schema/account.ts` — `account`, `accountRole`, `address` schemas.
- `db/cart.ts` — guest cart repository.
- `app/cart/page.tsx` — guest cart page.
- `app/cart/session.ts` — `readCartSessionToken`.
- `app/checkout/` — `payment-outcome.tsx` presentational surface.
- `stitch_image_based_application/carrito_pasarela_de_pago_simulada/code.html` — design reference for Identification and Address & Shipping blocks.

### Existing Patterns To Follow

- Money is integer cents, formatted with `formatPriceUSD`.
- Route handlers return `Cache-Control: no-store` on mutating responses.
- Session identity is exclusively derived from the `ja_cart_session` cookie; no cart or session tokens are accepted from request bodies.
- Vitest suites cover DB repository methods (`db/tests/`) and UI components (`app/checkout/`, `app/cart/`).

## Technical Approach

1. **Database Layer**:
   - Add `recipientName: text("recipient_name")` to `address` in `db/schema/account.ts`.
   - Add `checkoutSession` table in `db/schema/order.ts` with columns:
     - `id`: uuid primary key default random
     - `cartId`: uuid foreign key to `cart.id` (unique, cascading on delete)
     - `email`: text not null
     - `recipientName`: text not null
     - `line1`: text not null
     - `line2`: text (optional)
     - `city`: text not null
     - `state`: char(2) not null
     - `zip`: text not null
     - `country`: char(2) not null default 'US'
     - `phone`: text (optional)
     - `createdAt`: timestamptz not null default now
     - `updatedAt`: timestamptz not null default now
   - Generate migration with `pnpm db:generate`.
   - Update `CORE_TABLES` in `db/tests/migrate.test.ts` to include `checkout_session`.
   - Create checkout repository functions in `db/checkout.ts`:
     - `getCheckoutSession(db, sessionToken)`
     - `saveCheckoutContactAndAddress(db, sessionToken, input)`
2. **Validation Layer (`app/checkout/checkout-input.ts`)**:
   - Pure validation functions:
     - Email: trimmed, lowercased, RFC-compliant format regex.
     - Recipient Name: trimmed, non-empty.
     - Line 1: trimmed, non-empty.
     - Line 2: trimmed, nullable.
     - City: trimmed, non-empty.
     - State: trimmed, uppercase, valid US 2-letter state code.
     - ZIP: trimmed, valid 5-digit or 5+4 US ZIP code.
     - Country: "US".
     - Phone: trimmed, nullable.
   - Return `{ ok: true, data }` or `{ ok: false, errors: { [field]: string } }`.
3. **API Layer (`app/api/checkout/contact-and-address/route.ts`)**:
   - `POST`: reads `ja_cart_session` cookie; validates payload with `parseCheckoutContactAndAddress`; calls `saveCheckoutContactAndAddress`; returns `Cache-Control: no-store` and JSON `{ ok: true, checkoutSession }`.
   - `GET`: returns existing checkout session if any for the cart.
4. **Checkout UI (`app/checkout/`)**:
   - On `/cart/page.tsx`: add "Proceed to Checkout" button/link to `/checkout`.
   - Create `app/checkout/page.tsx`:
     - Reads `ja_cart_session` cookie. If no cookie or empty cart, shows empty state with "Continue shopping".
     - Loads cart summary (items, subtotal) and checkout session.
     - Renders order summary sidebar/block and checkout steps container.
   - Create `app/checkout/contact-and-address-form.tsx`:
     - Client component managing form state and Step 1 display.
     - If checkout session exists and not in edit mode: displays completed summary card (email, recipient name, address lines, phone) with "Modify" button and Step 2 ("Shipping Method") indicator.
     - If in edit mode (or no session): displays form with inputs, pre-filled values, inline validation error alerts, and "Continue to Shipping" submit button.
5. **Styling in `app/globals.css`**:
   - `.checkout*` styles adhering to `DESIGN.md` (high contrast, hairline borders, serif headings, uppercase tracking labels, responsive grid for summary + steps).

## Expected File Changes

- `db/schema/account.ts` — modify: add `recipientName` to `address`.
- `db/schema/order.ts` — modify: add `checkoutSession` table.
- `db/schema/index.ts` — modify: export `checkoutSession` and its types.
- `db/migrations/` — create: new migration file generated by `pnpm db:generate`.
- `db/tests/migrate.test.ts` — modify: add `checkout_session` to `CORE_TABLES`.
- `db/checkout.ts` — create: repository methods for checkout session.
- `db/tests/checkout-contact-and-address.test.ts` — create: integration tests for repository.
- `app/checkout/checkout-input.ts` — create: input validation functions.
- `app/checkout/checkout-input.test.ts` — create: unit tests for validation rules.
- `app/api/checkout/contact-and-address/route.ts` — create: route handler for `POST` and `GET`.
- `app/api/checkout/contact-and-address/route.test.ts` — create: route tests.
- `app/checkout/contact-and-address-form.tsx` — create: client component for step 1 & summary.
- `app/checkout/contact-and-address-form.test.tsx` — create: component tests.
- `app/checkout/page.tsx` — create: `/checkout` page.
- `app/checkout/page.test.tsx` — create: page tests.
- `app/cart/page.tsx` — modify: add "Proceed to Checkout" link.
- `app/cart/page.test.tsx` — modify: assert "Proceed to Checkout" link is rendered.
- `app/globals.css` — modify: add checkout styles.
- `ARCHITECTURE.md` — modify: document checkout route, session persistence, and data layer.
- `feature_list.json` — modify: update feature status and verification.
- `PROGRESS.md` — modify: log session 030.

## Verification Plan

- `CI=true ./init.sh`: lint, typecheck, unit tests, DB integration tests all pass.
- `pnpm build`: production build succeeds with dynamic `/checkout` and `/api/checkout/contact-and-address`.
- Specific test suites:
  - `db/tests/checkout-contact-and-address.test.ts`: DB upsert, update, cart association, session isolation.
  - `app/checkout/checkout-input.test.ts`: pure validation for email, state, zip, required fields.
  - `app/api/checkout/contact-and-address/route.test.ts`: HTTP status codes, cookie auth, error responses.
  - `app/checkout/contact-and-address-form.test.tsx`: UI interaction, inline errors, step advance, modify toggle.
  - `app/checkout/page.test.tsx`: Empty cart state, populated state, order summary rendering.
  - `app/cart/page.test.tsx`: "Proceed to Checkout" button verification.
