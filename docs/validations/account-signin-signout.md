# Validation Record: account-signin-signout

## Feature Information

- **Feature ID:** `account-signin-signout`
- **Spec:** `docs/specs/account-signin-signout.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Password sign-in establishes session that survives reload
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/account-signin-signout.test.ts` ("Scenario 1: Password sign-in success & failure"):
    - Authenticates an account with correct password using scrypt hash verification (`verifyPassword`).
    - Resolves account id, email and roles (`["customer"]`).
    - Matches case-insensitively on email.
  - `app/api/auth/signin/route.test.ts`:
    - `POST /api/auth/signin` with valid credentials returns 200 `{ ok: true, account: { id, email } }`.
    - Mints and sets `ja_account_session` httpOnly cookie (Max-Age 30 days, SameSite=Lax, Path=/).
  - `app/account/signin/page.test.tsx`:
    - Entering valid email and password navigates to `/account` and calls `router.refresh()`.
  - Dev server live transcript:
    - `POST /api/auth/signin` on `http://127.0.0.1:3013/api/auth/signin` returned HTTP 200 with `Set-Cookie: ja_account_session=...`.
    - `GET /account` with cookie jar returned HTTP 200 with "Account Overview", email, and "Sign Out".
    - `GET /api/auth/me` with cookie jar returned HTTP 200 `{ authenticated: true, account: ..., roles: ['customer'] }`.

### Scenario 2: Password sign-in failure with invalid credentials
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/account-signin-signout.test.ts`:
    - Wrong password returns `{ ok: false, error: "invalid_credentials" }`.
    - Unknown email returns `{ ok: false, error: "invalid_credentials" }`.
    - Passwordless account (`passwordHash: null`) returns `{ ok: false, error: "invalid_credentials" }`.
  - `app/api/auth/signin/route.test.ts`:
    - Returns HTTP 401 `{ ok: false, error: "Invalid email or password." }` without setting a cookie.
  - `app/account/signin/page.test.tsx`:
    - Displays error banner with `data-testid="signin-error"` containing "Invalid email or password.".
  - Dev server live transcript:
    - `POST /api/auth/signin` with invalid credentials returned HTTP 401 without cookie.

### Scenario 3: Passwordless sign-in via 6-digit email OTP
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/account-signin-signout.test.ts` ("Scenario 2: Passwordless OTP request & verification"):
    - `requestPasswordlessAccessCode` generates 6-digit numeric OTP code (`/^\d{6}$/`) and emails it via `AccessCodeEmailSender`.
    - Code is persisted in `account_access_code` with 15-minute expiration.
    - `verifyPasswordlessAccessCode` validates the code and account, returning `{ ok: true, account, roles }`.
  - `lib/email/access-code.test.ts`:
    - Renders subject "Your J. Armando Access Code", plain text, and HTML with the 6-digit code and 15-minute expiration note.
  - `app/api/auth/access-code/route.test.ts`:
    - `POST /api/auth/request-code` returns 200 `{ ok: true }`.
    - `POST /api/auth/verify-code` returns 200 `{ ok: true, account }` and sets `ja_account_session` cookie.
  - `app/account/signin/page.test.tsx`:
    - Switching to "Email Code" tab displays the email input and "Send Code" button.
    - Sending code reveals 6-digit code input (`data-testid="code-input"`).
    - Submitting code verifies and navigates to `/account`.
  - Dev server live transcript:
    - Tested against live PostgreSQL database with passwordless account.
    - `POST /api/auth/request-code` -> 200.
    - Retrieved code from `account_access_code` table.
    - `POST /api/auth/verify-code` -> 200 with session cookie.
    - `GET /account` with session cookie -> 200 with "Account Overview".

### Scenario 4: Replay or expiration of OTP access code is rejected
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/account-signin-signout.test.ts`:
    - Verifying with wrong code returns `{ ok: false, error: "invalid_code" }`.
    - Upon successful verification, the code is deleted from `account_access_code` (single use).
    - Verifying the same code a second time fails with `{ ok: false, error: "invalid_code" }`.
  - `app/api/auth/access-code/route.test.ts`:
    - Submitting invalid code returns HTTP 400 without setting cookie.
  - `app/account/signin/page.test.tsx`:
    - Displays error banner with `data-testid="signin-error"` containing "Invalid or expired access code.".
  - Dev server live transcript:
    - Attempting invalid code "000000" returned HTTP 400.
    - Valid code succeeded and was removed from `account_access_code` (0 rows remaining).

### Scenario 5: Customer sign out terminates session
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/account-signin-signout.test.ts` ("Scenario 4: Sign out revokes session"):
    - `revokeAccountSession` deletes the session token row from `account_session`.
    - `getAccountFromSessionToken` subsequently returns `null`.
  - `app/api/auth/signout/route.test.ts`:
    - `POST /api/auth/signout` revokes session in DB and clears `ja_account_session` cookie (`Max-Age=0`).
  - `app/account/page.test.tsx`:
    - Clicking "Sign Out" button calls `POST /api/auth/signout`, redirects to `/account/signin`, and triggers `router.refresh()`.
  - Dev server live transcript:
    - Calling `POST /api/auth/signout` with active session cookie returned HTTP 200 and cleared cookie.
    - Subsequent `GET /account` returned HTTP 307 redirecting to `/account/signin`.

### Scenario 6: Unauthenticated visitor accessing protected `/account`
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/account/page.test.tsx`:
    - Visiting `AccountPage` without cookie or with expired session redirects to `/account/signin`.
  - Dev server live transcript:
    - `GET /account` without cookie returned HTTP 307 with `Location: /account/signin`.

---

## Verification Suite Results

- `CI=true ./init.sh`: **72 test files / 556 tests passed** (0 failures, all green).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (clean Next.js 16.4.0 Turbopack production build; all routes dynamic/static as designed).
- `pnpm db:migrate`: exit 0 (migration `0006_fresh_zombie.sql` applied cleanly).

## Non-Regression & Scope Discipline

- Money handling: All money values strictly integer cents, formatted via `formatPriceUSD`.
- Language: English throughout all UI copy and documentation.
- Architecture: Auth data access strictly encapsulated in `db/auth.ts`, session cookies in `lib/auth/session-cookie.ts`, email in `lib/email/access-code.ts`.
- Scope boundaries respected: No password recovery, email verification, or social sign-in added (deferred post-MVP).
