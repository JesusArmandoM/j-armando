# Validation Record: account-created-at-payment

## Feature Information

- **Feature ID:** `account-created-at-payment`
- **Spec:** `docs/specs/account-created-at-payment.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: First-time purchase creates new customer account
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-created-at-payment.test.ts` ("Scenario 1: first-time email creates new account with role 'customer' and links order, address, and cart"):
  - When payment succeeds with a new contact email (`first.buyer@example.com`), `createPaidOrderFromCheckout` inserts a row into `account` with the normalized lowercase email.
  - Inserts an associated row into `account_role` with `role: "customer"`.
  - Sets `order.accountId` to the newly created account ID.
  - Sets shipping `address.accountId` to the newly created account ID.
  - Sets `cart.accountId` to the newly created account ID and transitions `cart.status` to `"converted"`.
  - Returns `{ ok: true, accountId, isNewAccount: true, ... }`.
  - `getOrderByReference` returns `accountId` and `isNewAccount: true`.

### Scenario 2: Repeat purchase reuses existing account without duplication
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-created-at-payment.test.ts` ("Scenario 2: repeat purchase with existing email attaches to existing account without duplicate account creation"):
  - Placing a second order with an already registered email (`returning.customer@example.com`) looks up the existing account ID.
  - `result.isNewAccount` is `false`, and `result.accountId` matches `existingAccountId`.
  - Exactly 1 row exists in `account` for that email; no duplicate account is created.
  - Exactly 1 row exists in `account_role` for that account ID.
  - The second order row has `order.accountId = existingAccountId`.
  - `getOrderByReference` for the second order returns `isNewAccount: false`.

### Scenario 3: Email normalization (lowercase and whitespace trimming)
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-created-at-payment.test.ts` ("Scenario 3: email normalization trims whitespace and downcases, linking mixed-case repeat purchases"):
  - Contact email `"  MixedCase.User@Example.COM  "` is trimmed and downcased to `"mixedcase.user@example.com"`.
  - Stored `account.email` is verified to be `"mixedcase.user@example.com"`.
  - A subsequent checkout with differently cased `"mixedcase.user@EXAMPLE.com"` resolves to the existing account ID and attaches the order to the same account.
  - `account` table count for `"mixedcase.user@example.com"` remains 1.

### Scenario 4: Database check constraint enforcement
- **Result:** PASS
- **Evidence:** Verified in `db/tests/account-created-at-payment.test.ts` ("Scenario 4: check constraint chk_account_email_lowercase rejects uppercase email inserts"):
  - Attempting to insert an uppercase email `"UppercaseCheck@Example.com"` directly into `account` is rejected by PostgreSQL check constraint `chk_account_email_lowercase`.

### Scenario 5: Order confirmation page renders account notice
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/confirmation/[reference]/page.test.tsx` (9/9 tests passed):
  - Renders welcoming notice for new accounts: `"We've created an account for your order at elena.rostova@example.com."`
  - Renders linked notice when order is linked to existing account: `"Order linked to your account elena.rostova@example.com."`
  - Supports query parameter `account=linked` or `new_account=false`.
  - Notice element is identified with `data-testid="account-notice"`.

---

## Verification Suite Results

- `CI=true ./init.sh`: **58 test files / 471 tests passed** (0 failures).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (compiled dynamic routes `ƒ /api/checkout/pay`, `ƒ /checkout/confirmation/[reference]`, `ƒ /checkout`, `ƒ /cart`).
- Focused test suites:
  - `db/tests/account-created-at-payment.test.ts`: 4/4 passed
  - `app/checkout/confirmation/[reference]/page.test.tsx`: 9/9 passed
  - `app/api/checkout/pay/route.test.ts`: 7/7 passed
  - `db/tests/order-creation.test.ts`: 6/6 passed

---

## Findings

None. All acceptance criteria met with atomic transaction safety, check constraint compliance, integer-cent money discipline, and clean test coverage.

---

## Verdict

**ACCEPT** — The feature is complete, verified, secure, and ready for production handoff.
