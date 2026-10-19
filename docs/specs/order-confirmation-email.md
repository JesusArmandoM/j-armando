# Feature Implementation Spec: Order confirmation email is sent on a paid order

## Source Feature

- `id`: `order-confirmation-email`
- `area`: `notifications`
- `depends_on`: `["order-creation-on-payment"]`
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When an order becomes paid at checkout:
1. Exactly one order confirmation email is sent to the shopper's contact email.
2. The email displays the unique human-readable order reference (e.g. `JA-XXXXXX`).
3. The email details all purchased line items with frozen product names, sizes, colors, quantities, unit prices ($X.XX), and line totals ($X.XX).
4. The email displays the frozen financial breakdown: subtotal, shipping cost, sales tax, and total, all computed in integer cents and formatted in USD via `formatPriceUSD`.
5. The email displays the shipping destination address (recipient name, address line 1, city, state, ZIP).
6. Both clean plain-text and HTML versions are generated.
7. External email capabilities sit behind a repo-owned `EmailSender` interface, with an in-memory simulated sender (`SimulatedEmailSender`) capturing sent messages for self-contained automated testing.
8. Email delivery failures degrade gracefully: if email sending throws or fails, the failure is logged safely without leaking sensitive personal data or secrets, and the paid order is never rolled back or aborted.

## Non-Goals

- Production SMTP / external transactional email vendor (e.g. Resend, SendGrid, Postmark) integrations requiring live API keys in CI/tests (respecting `CONSTRAINTS.md`).
- Marketing or newsletter emails (excluded from MVP per `docs/mvp-scope.md`).
- Order fulfillment update emails (shipped, out for delivery, delivered) — fulfillment portal and tracking are post-MVP.
- Email verification / password reset emails (post-MVP).

## Job Story

When my payment succeeds at checkout,
I want an immediate confirmation email sent to my contact email address with my order reference, purchased items, and exact financial totals,
so that I have an immutable record of my purchase and confidence that my order was placed successfully.

## Users and Permissions

- **Shoppers (Guest & Authenticated):** Provide their contact email at checkout Step 1. The confirmation email is sent strictly to this contact address.
- **Privacy & Security:** Email logs must not contain secrets, payment card tokens, or sensitive personal data.

## Acceptance Scenarios

### Scenario 1: Successful paid order sends exactly one confirmation email
Given a shopper with an active cart, saved address, and selected shipping method
When checkout payment succeeds and the order record is created in status `"paid"`
Then exactly one confirmation email is sent to the contact email address
And the subject line matches `Order Confirmation - [reference]`
And the email payload records the created order's reference and recipient email.

### Scenario 2: Email content matches frozen order details and totals in USD
Given an order confirmation email generated for a paid order
When the email content (plain text and HTML) is inspected
Then:
- The store name `J. Armando` and order reference are prominently displayed.
- Each purchased line item is rendered with product name, variant color, variant size, quantity, unit price in USD, and line total in USD.
- The financial summary clearly breaks down: Subtotal, Shipping, Estimated Tax, and Total formatted in USD.
- The shipping destination displays recipient name, street lines, city, state, and ZIP.
- Financial figures strictly match the frozen integer-cent snapshots on the order record.

### Scenario 3: Failed payment triggers no confirmation email
Given a checkout payment attempt that fails (e.g. card declined, insufficient funds)
When payment fails
Then no order is created
And no confirmation email is sent to any email address.

### Scenario 4: Incomplete checkout triggers no confirmation email
Given a checkout request with missing cart, missing shipping address, or missing shipping method
When order creation is rejected with HTTP 400
Then no confirmation email is dispatched.

### Scenario 5: Email delivery failure does not roll back or fail the paid order (Graceful Degradation)
Given an order creation request where payment succeeds but the email sender throws an error
When the email dispatch throws
Then the paid order is still created and committed in the database
And the active cart is converted
And the error is logged with the order reference without exposing customer email or address details
And the API returns success with the order reference.

## Technical Plan

1. **Email Port and Abstraction (`lib/email/order-confirmation.ts` & `lib/email/email-service.ts`):**
   - Define `OrderConfirmationLine`, `OrderConfirmationShippingAddress`, and `OrderConfirmationEmailPayload`.
   - Define `EmailSender` interface with `sendOrderConfirmation(payload)`.
   - Define `SimulatedEmailSender` with in-memory delivery store, failure simulation option, and query helpers (`getSentConfirmationEmails()`, `clearSentEmails()`).
   - Implement `renderOrderConfirmationSubject`, `renderOrderConfirmationText`, and `renderOrderConfirmationHtml` using `formatPriceUSD`.

2. **Integration into Order Creation (`db/order.ts`):**
   - Update `createPaidOrderFromCheckout(db, sessionToken, provider?, emailSender?)`.
   - After the database transaction commits the order and converted cart, construct the `OrderConfirmationEmailPayload` using frozen line items, shipping address, and calculated totals.
   - Dispatch `emailSender.sendOrderConfirmation(...)` inside a safe non-blocking try/catch block.
   - On error, log `[order-confirmation-email] Failed to send confirmation email for order <reference>` without sensitive customer data, allowing the paid order result to be returned successfully.

3. **Self-Contained Automated Testing:**
   - Unit tests: `lib/email/order-confirmation.test.ts` verifying text/HTML rendering, subject format, simulated sender storage, and error options.
   - Integration tests: `db/tests/order-confirmation-email.test.ts` using embedded PostgreSQL verifying 1-to-1 dispatch on paid order, exact frozen details, zero dispatch on payment failure or incomplete checkout, and resilience when email sender throws.
