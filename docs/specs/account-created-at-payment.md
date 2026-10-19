# Feature Implementation Spec: Payment creates or links the account by email

## Source Feature

- `id`: `account-created-at-payment`
- `area`: `identity`
- `depends_on`: `["order-creation-on-payment"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When payment succeeds on checkout:
1. Contact email from the checkout session is normalized (trimmed and lowercased).
2. The system checks if an account already exists for that normalized email.
3. If no account exists:
   - A new row is inserted into `account` with the normalized email.
   - A corresponding role row is inserted into `account_role` with role `"customer"`.
4. If an account already exists:
   - The existing account ID is reused; no second account is ever created for that email.
5. In the same atomic database transaction:
   - `order.accountId` is set to the target account ID.
   - `address.accountId` is set to the target account ID.
   - `cart.accountId` is set to the target account ID (along with status `"converted"`).
6. The order confirmation page at `/checkout/confirmation/[reference]` renders a clear welcoming account status message indicating that an account was created or linked for the customer's email.

## Non-Goals

- Collecting or setting a password at checkout (owned by subsequent feature `account-quick-access-password`).
- Customer sign-in / sign-out sessions and session tokens (owned by `account-signin-signout`).
- Account management or order history dashboard (owned by `account-order-history`).
- Real email verification or password reset emails (excluded from MVP).

## Job Story

When I pay for an order as a guest shopper,
I want the store to automatically create an account for my email (or link to my existing account if I already have one) without forcing me to register beforehand,
so that my order history and shipping address are tied to my identity while keeping checkout fast and frictionless.

## Users And Permissions

- **Guest Shopper:** enters their contact email in checkout Step 1. Upon successful payment, an account is created or linked for them automatically.
- **Repeat Shopper:** enters an email that already has an account; their new order attaches to that account without duplicate record errors or friction.

## Acceptance Scenarios

### Scenario 1: First-time purchase creates new customer account
Given a guest checkout with an email address not yet present in the `account` table (e.g. `newshopper@example.com`)
When payment succeeds and `createPaidOrderFromCheckout` runs
Then exactly one new row is inserted in `account` with `email: "newshopper@example.com"`
And a corresponding row is inserted in `account_role` with `role: "customer"`
And the newly created `order.accountId` references this new account
And the created shipping `address.accountId` references this new account
And the `cart.accountId` references this new account with status `"converted"`
And `createPaidOrderFromCheckout` returns `{ ok: true, accountId, isNewAccount: true, ... }`.

### Scenario 2: Repeat purchase reuses existing account without duplication
Given an email that already exists in the `account` table (e.g. `returning@example.com`)
When a new checkout session is completed and paid with that same email
Then NO new row is inserted into `account` (account count for that email remains 1)
And NO duplicate `account_role` row is created
And the new `order.accountId` references the existing account ID
And the new shipping `address.accountId` references the existing account ID
And the `cart.accountId` references the existing account ID
And `createPaidOrderFromCheckout` returns `{ ok: true, accountId: existingAccountId, isNewAccount: false, ... }`.

### Scenario 3: Email normalization (lowercase and whitespace trimming)
Given a checkout with an email containing uppercase characters and leading/trailing whitespace (e.g. `"  Customer.Jane@Example.COM  "`)
When payment is processed
Then the email is normalized to `"customer.jane@example.com"`
And the account is stored with the normalized email
And subsequent checkouts with different casing (e.g. `"CUSTOMER.JANE@EXAMPLE.COM"`) resolve to the exact same account ID.

### Scenario 4: Database check constraint enforcement
Given the PostgreSQL check constraint `chk_account_email_lowercase` on `account.email`
When an attempt is made to insert an email with uppercase letters directly into `account`
Then the database rejects the insert with a check constraint violation.

### Scenario 5: Order confirmation page renders account notice
Given a confirmed order viewed at `/checkout/confirmation/[reference]`
When the page renders
Then it displays an account status notice:
  - For a new account: `"We've created an account for your order at {contactEmail}."`
  - For a linked account: `"Order linked to your account {contactEmail}."`
And the notice has test identifier `data-testid="account-notice"`.

## Technical Plan

1. **`db/order.ts` (`createPaidOrderFromCheckout`):**
   - Inside the transaction block:
     - Normalize email: `const normalizedEmail = session.email.trim().toLowerCase();`
     - Select from `account` where `email = normalizedEmail`.
     - If existing, use `existingAccount.id`.
     - If missing, insert into `account` returning `id`, and insert `accountRole` with `role: "customer"`.
     - Insert `address` with `accountId: targetAccountId`.
     - Insert `order` with `accountId: targetAccountId` and `contactEmail: normalizedEmail`.
     - Update `cart` with `accountId: targetAccountId` and `status: "converted"`.
     - Return `accountId: targetAccountId` and `isNewAccount: !existingAccount`.
   - In `OrderWithDetails`:
     - Add `accountId: string | null` and `isNewAccount?: boolean`.
   - In `getOrderByReference`:
     - Query earlier orders for `orderRow.order.accountId` to determine if this order is the first order (`isNewAccount = true`) or a subsequent order (`isNewAccount = false`).

2. **`app/api/checkout/pay/route.ts`:**
   - Return `accountId` and `isNewAccount` in JSON response.

3. **`app/checkout/confirmation/[reference]/page.tsx` & `app/globals.css`:**
   - Accept optional `searchParams`.
   - Determine `isLinked` from `query.new_account === "false" || query.account === "linked" || order.isNewAccount === false`.
   - Render `.order-confirmation__account-notice` with `data-testid="account-notice"`.

4. **Tests:**
   - `db/tests/account-created-at-payment.test.ts`: comprehensive DB integration test covering Scenarios 1-4.
   - `app/checkout/confirmation/[reference]/page.test.tsx`: test verifying `account-notice` rendering for both new and linked accounts.
   - `app/api/checkout/pay/route.test.ts`: test verifying `accountId` and `isNewAccount` in payment response.
