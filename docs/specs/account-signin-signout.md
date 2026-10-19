# Feature Implementation Spec: Customer signs in and out

## Source Feature

- `id`: `account-signin-signout`
- `area`: `identity`
- `depends_on`: `["account-quick-access-password"]` (accepted)
- `status`: `accepted`
- `source`: `feature_list.json`

## Goal

Provide a complete, production-grade customer sign-in and sign-out experience for J. Armando:
1. **Schema & Tables:**
   - Add `account_session` table to track persistent, opaque session tokens with 30-day expiration, referencing `account.id` with `ON DELETE CASCADE`.
   - Add `account_access_code` table to track 6-digit numeric OTP access codes with 15-minute expiration for passwordless sign-in, referencing `account.id` with `ON DELETE CASCADE`.
2. **Auth & Session Repository (`db/auth.ts`):**
   - `authenticateWithPassword`: verifies credentials using scrypt hash verification (`verifyPassword`).
   - `createAccountSession`: creates an opaque 32-byte base64url session token and stores it in `account_session`.
   - `getAccountFromSessionToken`: resolves active, unexpired session and retrieves account details and assigned roles.
   - `revokeAccountSession`: deletes the session row to terminate authentication.
   - `requestPasswordlessAccessCode`: generates a 6-digit numeric OTP code, invalidates previous codes for the account, persists it with a 15-minute expiry, and dispatches it via the access code email service.
   - `verifyPasswordlessAccessCode`: verifies the code for the account, single-use deletes the code upon success, and returns account details.
3. **Session Cookie Helpers (`lib/auth/session-cookie.ts`):**
   - Cookie `ja_account_session` configured with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000` (30 days), and `Secure` in production.
4. **Email Service (`lib/email/access-code.ts`):**
   - Dispatches access code emails with clear English copy and simulated test sender (`SimulatedAccessCodeEmailSender`).
5. **Route Handlers:**
   - `POST /api/auth/signin`
   - `POST /api/auth/request-code`
   - `POST /api/auth/verify-code`
   - `POST /api/auth/signout`
   - `GET /api/auth/me`
6. **Storefront UI:**
   - `/account/signin`: tabs for "Password" and "Email Code", clear error alerts, redirects to `/account` or `returnUrl`.
   - `/account`: protected overview page showing account email, roles, and "Sign Out" button.
   - Global site header with "Account" navigation link in `app/layout.tsx`.

## Non-Goals

- Password recovery or reset workflows (deferred post-MVP).
- Email verification flows (deferred post-MVP).
- Social sign-in (OAuth/SAML) (out of MVP scope).
- Cart merging on sign-in (separate follow-up feature).

## Acceptance Scenarios

### Scenario 1: Password sign-in establishes session that survives reload
Given a customer account with a configured password
When the customer submits their valid email and password at `/account/signin`
Then `POST /api/auth/signin` returns 200 and sets the httpOnly `ja_account_session` cookie
And navigating to `/account` renders the Account Overview with their email and roles
And refreshing the page or reloading preserves the authenticated session.

### Scenario 2: Password sign-in failure with invalid credentials
Given a customer or unknown email
When an invalid password or non-existent email is submitted
Then `POST /api/auth/signin` returns 401 with `{ ok: false, error: "Invalid email or password." }`
And no session cookie is set
And the sign-in form displays an error message with `data-testid="signin-error"`.

### Scenario 3: Passwordless sign-in via 6-digit email OTP
Given an account created without a password during checkout
When the customer switches to the "Email Code" tab and submits their email
Then `POST /api/auth/request-code` generates a 6-digit access code and dispatches an email
And when the customer enters the received 6-digit code and submits
Then `POST /api/auth/verify-code` validates the code, single-use deletes it, and sets `ja_account_session`
And the customer is redirected to `/account`.

### Scenario 4: Replay or expiration of OTP access code is rejected
Given an issued 6-digit access code
When the customer attempts to reuse the same code or use an expired code
Then `POST /api/auth/verify-code` returns 400 and does not establish a session.

### Scenario 5: Customer sign out terminates session
Given an authenticated customer visiting `/account`
When the customer clicks "Sign Out"
Then `POST /api/auth/signout` revokes the session in `account_session` and clears `ja_account_session`
And subsequent visits to `/account` redirect to `/account/signin`.

### Scenario 6: Unauthenticated visitor accessing protected `/account`
Given an unauthenticated visitor with no `ja_account_session` cookie
When they navigate to `/account`
Then they are redirected to `/account/signin`.
