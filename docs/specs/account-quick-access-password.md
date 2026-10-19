# Feature Implementation Spec: Shopper can set an optional password at checkout

## Source Feature

- `id`: `account-quick-access-password`
- `area`: `identity`
- `depends_on`: `["account-created-at-payment"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

During checkout Step 1 (Contact & Shipping Address), the shopper can choose to set a password for Quick Access to their account, or skip it and complete the purchase without setting a password:
1. Provide a secure, standard Node crypto hashing utility (`lib/auth/password.ts`) using `crypto.scrypt` with random salt and `crypto.timingSafeEqual` for verification, validating passwords for a minimum of 8 characters.
2. In `db/schema/order.ts`, add nullable `password_hash` column to `checkout_session` table and generate migration `0005`.
3. In `db/checkout.ts`, accept optional `passwordHash` in `saveCheckoutContactAndAddress` and persist it to the checkout session.
4. In `db/order.ts`, inside `createPaidOrderFromCheckout`:
   - If creating a new account: persist `passwordHash: session.passwordHash ?? null`.
   - If an account exists and currently has `passwordHash: null`, and `session.passwordHash` is provided: update `account.passwordHash` with `session.passwordHash`.
   - If no password was provided, `passwordHash` remains `null`.
5. In `app/checkout/checkout-input.ts`, accept optional `password` field in form payload; if present and non-empty, enforce minimum 8 characters.
6. In `app/api/checkout/contact-and-address/route.ts`, if `password` is provided, validate length, hash it with `hashPassword`, and save the hash in the checkout session.
7. In `app/checkout/contact-and-address-form.tsx`, render an optional Quick Access password field with clear helper text ("Minimum 8 characters. Skip if you prefer not to set a password now."), inline error validation for short passwords, without blocking progression if omitted.
8. In `app/checkout/confirmation/[reference]/page.tsx`, if the order's account has a Quick Access password configured, display a clear welcoming notice indicating Quick Access is active.

## Non-Goals

- Password reset or recovery flows (explicitly out of MVP scope).
- Email verification flows (explicitly out of MVP scope).
- Customer sign-in / sign-out sessions and session tokens (owned by subsequent feature `account-signin-signout`).
- Storing or logging plaintext passwords anywhere in application logs or the database.

## Job Story

When I checkout as a shopper,
I want the option to set a password for quick access to my account without being forced to create one,
So that I can return and sign in easily in the future while still enjoying a fast, frictionless guest checkout if I choose not to set a password.

## Users And Permissions

- **Guest Shopper setting password:** Enters contact details, address, and an optional password (>= 8 characters). The account created upon payment will have their password hash saved.
- **Guest Shopper skipping password:** Leaves the password field empty. The account is created with `passwordHash = null` upon payment.
- **Repeat Shopper with existing passwordless account:** Checks out with an email previously used without a password, but now sets a password. The existing account is updated with the new password hash upon payment.

## Acceptance Scenarios

### Scenario 1: Completing checkout with a password creates an account with passwordHash
Given a shopper entering contact details and a valid password (>= 8 characters, e.g. `"SecurePass123"`)
When they submit Step 1 and proceed to pay
Then `checkoutSession.passwordHash` holds the scrypt salt+hash (`<salt>:<hash>`)
And when payment succeeds, the created `account.passwordHash` matches the secure hash
And `verifyPassword("SecurePass123", account.passwordHash)` returns `true`
And plaintext password is never stored or logged.

### Scenario 2: Completing checkout without a password succeeds with null passwordHash
Given a shopper entering contact details and leaving the password input blank
When they submit Step 1 and proceed to pay
Then `checkoutSession.passwordHash` is `null`
And when payment succeeds, the account is created with `passwordHash: null`
And the order is created and paid successfully.

### Scenario 3: Inline validation rejects passwords shorter than 8 characters
Given a shopper entering a password with fewer than 8 characters (e.g. `"secret"`, `"1234567"`)
When they attempt to submit Step 1
Then an inline validation error is displayed ("Password must be at least 8 characters long")
And the form submission is prevented
And if sent to `POST /api/checkout/contact-and-address`, the API returns HTTP 400 with `{ errors: { password: "Password must be at least 8 characters long" } }`.

### Scenario 4: Updating a passwordless account on subsequent purchase
Given an existing account in `account` with `email: "shopper@example.com"` and `passwordHash: null`
When that shopper checks out and provides a valid password
Then upon payment completion, the existing `account` record is updated with the new `passwordHash`
And the existing account ID is retained.

### Scenario 5: Order confirmation page conveys Quick Access password readiness
Given an order placed by a customer whose account has a password set
When the order confirmation page is loaded at `/checkout/confirmation/[reference]`
Then a notice indicating Quick Access password is ready (`data-testid="password-notice"`) is displayed.

## Technical Plan

1. **`lib/auth/password.ts` and `lib/auth/password.test.ts`**:
   - `hashPassword(password: string): Promise<string>`: validates `>= 8` chars, generates 16 bytes random salt, hashes via `crypto.scrypt(password, salt, 64)`, outputs `saltHex:keyHex`.
   - `verifyPassword(password: string, storedHash: string): Promise<boolean>`: parses salt and keyHex, derives key via `crypto.scrypt`, compares using `crypto.timingSafeEqual`.
   - Comprehensive unit tests covering hashing, verification success/failure, length rejection, timing safety, and malformed hash handling.

2. **Schema & Migration**:
   - Update `db/schema/order.ts`: Add `passwordHash: text("password_hash")` to `checkoutSession`.
   - Run `pnpm db:generate` to produce `0005_checkout_session_password_hash.sql`.
   - Run `pnpm db:migrate` against dev database.
   - Update `db/tests/migrate.test.ts` to ensure migration runs idempotently.

3. **Data Layer (`db/checkout.ts` & `db/order.ts`)**:
   - `db/checkout.ts`: Update `CheckoutContactAndAddressInput` to include optional `passwordHash?: string | null`. In `saveCheckoutContactAndAddress`, store `passwordHash` in `checkoutSession` insert/update.
   - `db/order.ts`: In `createPaidOrderFromCheckout`, when creating account: set `passwordHash: session.passwordHash ?? null`. When account exists with `passwordHash: null` and `session.passwordHash` is provided: update `account.passwordHash`.
   - Update `OrderWithDetails` and `getOrderByReference` to include `hasPassword?: boolean`.

4. **API & Validation (`app/checkout/checkout-input.ts` & `app/api/checkout/contact-and-address/route.ts`)**:
   - `checkout-input.ts`: Add optional `password?: string` to `CheckoutContactAndAddressData` and `errors.password` to `CheckoutInputErrors`. In `parseCheckoutContactAndAddress`, validate if present and non-empty that `password.length >= 8`.
   - `route.ts`: Parse body. If `parsed.data.password` is provided, hash it with `hashPassword(parsed.data.password)` and pass `passwordHash` to `saveCheckoutContactAndAddress`.

5. **Storefront UI (`app/checkout/contact-and-address-form.tsx` & `app/checkout/confirmation/[reference]/page.tsx`)**:
   - In Step 1 of `contact-and-address-form.tsx`: Add optional password input with clear label ("Create password for quick access (optional)"), helper text ("Minimum 8 characters. Skip if you prefer not to set a password now."), and inline error validation.
   - In `app/checkout/confirmation/[reference]/page.tsx`: If `order.hasPassword` is true, render a Quick Access confirmation note (`data-testid="password-notice"`).
   - Add styling in `app/globals.css`.

6. **Verification & Tests**:
   - `lib/auth/password.test.ts`: Unit tests for password hashing & verification.
   - `db/tests/account-quick-access-password.test.ts`: Integration tests for all database and order creation scenarios.
   - `app/api/checkout/contact-and-address/route.test.ts`: Route tests verifying password handling and validation.
   - `app/checkout/contact-and-address-form.test.tsx`: UI tests for password field interaction, validation, and skipping.
   - `app/checkout/confirmation/[reference]/page.test.tsx`: UI tests for Quick Access password notice on confirmation page.
