# Validation Record: account-quick-access-password

## Feature Information

- **Feature ID:** `account-quick-access-password`
- **Spec:** `docs/specs/account-quick-access-password.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Completing checkout with a password creates an account with passwordHash
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-quick-access-password.test.ts` ("Scenario 1: checkout with password sets passwordHash on session and created account"):
  - Password hashing utility (`lib/auth/password.ts`) securely hashes passwords using Node `crypto.scrypt` with a unique 16-byte random salt, outputting formatted `<saltHex>:<keyHex>`.
  - Password verification uses `crypto.timingSafeEqual` and returns true for matching password and false for wrong password.
  - Checkout session stores `passwordHash` (nullable text column in `checkout_session`).
  - Upon payment completion, `account.passwordHash` is populated with the secure scrypt hash.
  - Plaintext password is never stored or logged.
  - `getOrderByReference` returns `hasPassword: true`.

### Scenario 2: Completing checkout without a password succeeds with null passwordHash
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-quick-access-password.test.ts` ("Scenario 2: checkout without password creates account with null passwordHash"):
  - When the shopper submits Step 1 leaving the password field empty, `checkoutSession.passwordHash` is `null`.
  - Upon payment completion, `account.passwordHash` is `null`.
  - Order and cart conversion succeed without error.
  - `getOrderByReference` returns `hasPassword: false`.

### Scenario 3: Inline validation rejects passwords shorter than 8 characters
- **Result:** PASS
- **Evidence:** Verified in:
  - `lib/auth/password.test.ts`: validates minimum 8 characters; rejects shorter inputs.
  - `app/checkout/checkout-input.test.ts`: verifies `parseCheckoutContactAndAddress` returns error `password: "Password must be at least 8 characters long"` when password length is between 1 and 7 characters, while accepting omitted/empty string.
  - `app/api/checkout/contact-and-address/route.test.ts`: POST with password `"short"` returns HTTP 400 with structured error.
  - `app/checkout/contact-and-address-form.test.tsx`: client-side form prevents submission and displays inline validation error at `data-testid="error-password"`.

### Scenario 4: Updating a passwordless account on subsequent purchase
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-quick-access-password.test.ts` ("Scenario 3: subsequent checkout with password updates existing passwordless account" and "Scenario 4: subsequent checkout without password preserves existing password"):
  - When an existing customer whose account had `passwordHash: null` places a new order with a password, their `account.passwordHash` is atomically updated to the new hash.
  - The existing account ID is preserved; no duplicate account is created.
  - When an existing customer with an existing password hash places a subsequent order without a password, the existing password hash is preserved (not overwritten).

### Scenario 5: Order confirmation page conveys Quick Access password readiness
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/confirmation/[reference]/page.test.tsx`:
  - When `order.hasPassword` is `true`, renders `data-testid="password-notice"` stating `"Quick Access password active. You can sign in anytime using your email and password."`
  - When `order.hasPassword` is `false`, `password-notice` is not rendered.

---

## Verification Suite Results

- `CI=true ./init.sh`: **64 test files / 522 tests passed** (0 failures).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (Next.js 16.4.0 Turbopack production build succeeded with all routes).
- Focused test suites:
  - `lib/auth/password.test.ts`: 11/11 passed
  - `db/tests/account-quick-access-password.test.ts`: 4/4 passed
  - `app/api/checkout/contact-and-address/route.test.ts`: 11/11 passed
  - `app/checkout/checkout-input.test.ts`: 12/12 passed
  - `app/checkout/contact-and-address-form.test.tsx`: 18/18 passed
  - `app/checkout/confirmation/[reference]/page.test.tsx`: 11/11 passed

---

## Security & Architecture Audit

1. **Crypto & Salt:** Password hashing uses Node `crypto.scrypt` with a cryptographically secure 16-byte salt per hash (`crypto.randomBytes(16)`). Constant-time comparison is enforced with `crypto.timingSafeEqual`.
2. **Secrets Hygiene:** Plaintext passwords are never logged, never returned in API payloads, and never persisted to the database.
3. **Database Migration:** Migration `0005_dark_warbird.sql` generated and applied idempotently via Drizzle Kit.
4. **Data Layer Isolation:** Domain repository methods in `db/checkout.ts` and `db/order.ts` remain decoupled from HTTP/Next.js layers.
5. **Money Rules:** Integer-cent pricing is preserved across all cart, tax, shipping, and order calculations.

---

## Verdict

**ACCEPT** — All 5 acceptance scenarios verified with clean end-to-end evidence. Feature is ready for merge.
