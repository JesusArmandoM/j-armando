# Validation Record: admin-role-gate

## Feature Information

- **Feature ID:** `admin-role-gate`
- **Spec:** `docs/specs/admin-role-gate.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Admin account can open the backoffice
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-role-gate.test.ts` ("Scenario 1: Authenticated admin account is authorized to open the backoffice"):
    - Authenticates account with admin role.
    - Resolves session via `getAdminSession` returning `{ status: "authorized", account, roles }` with `roles` containing `"admin"`.
  - `app/admin/layout.test.tsx` ("Scenario 1: renders Backoffice shell and children for authorized admin"):
    - Renders backoffice header "J. Armando Backoffice", badge "Admin", navigation links ("Dashboard", "Products", "Orders"), admin email, storefront return link, and child components.
  - `app/admin/page.test.tsx`:
    - Renders "Backoffice Dashboard" title, personalized welcome message, and management cards for Catalog Management and Order Fulfillment.
  - Live Dev Server Verification (Port 3015):
    - `POST /api/auth/signin` with seeded credentials `admin@j-armando.store` / `Admin123!` returned HTTP 200 and minted `ja_account_session`.
    - `GET /admin` with session cookie returned HTTP 200 with backoffice shell and dashboard cards.
    - `GET /api/admin/check` with session cookie returned HTTP 200 `{ ok: true, admin: true, account: ..., roles: ["customer", "admin"] }`.

### Scenario 2: Customer account without admin role receives 403 Forbidden
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-role-gate.test.ts` ("Scenario 2: Customer account without admin role is forbidden from backoffice"):
    - Resolves customer-only session via `getAdminSession` returning `{ status: "forbidden", account, roles: ["customer"] }`.
  - `app/admin/layout.test.tsx` ("Scenario 2: renders 403 Forbidden page for authenticated customer lacking admin role"):
    - Renders editorial 403 page with `data-testid="admin-forbidden"`.
    - Renders message "Access Denied: You do not have permission to view the backoffice."
    - Displays signed-in customer email and provides return links to Store and Customer Account.
    - Withholds all backoffice child routes and content.
  - Live Dev Server Verification (Port 3015):
    - Created customer account `shopper@example.com` with role `customer` (no `admin` role).
    - `POST /api/auth/signin` with customer credentials returned HTTP 200.
    - `GET /admin` with customer session cookie returned HTTP 200 with `data-testid="admin-forbidden"` and "Access Denied: You do not have permission to view the backoffice."
    - `GET /api/admin/check` returned HTTP 403 `{ ok: false, error: "Access denied. Admin role required." }`.

### Scenario 3: Signed-out visitor is redirected to sign-in with returnUrl
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-role-gate.test.ts` ("Scenario 3: Signed-out visitor is unauthenticated"):
    - `getAdminSession` with missing/empty cookie returns `{ status: "unauthenticated" }`.
  - `app/admin/layout.test.tsx` ("Scenario 3: redirects unauthenticated visitor to /account/signin?returnUrl=/admin"):
    - Triggers Next.js `redirect("/account/signin?returnUrl=/admin")`.
  - Live Dev Server Verification (Port 3015):
    - `curl -i http://localhost:3015/admin` without cookies returned HTTP 307 redirecting to `/account/signin?returnUrl=/admin`.

### Scenario 4: Admin API check returns appropriate status codes
- **Result:** PASS
- **Evidence:** Verified in:
  - `app/api/admin/check/route.test.ts`:
    - Unauthenticated returns HTTP 401 `{ ok: false, error: "Authentication required." }`.
    - Forbidden returns HTTP 403 `{ ok: false, error: "Access denied. Admin role required." }`.
    - Authorized returns HTTP 200 `{ ok: true, admin: true, account, roles }`.
    - All responses include `Cache-Control: no-store`.
  - Live Dev Server Verification (Port 3015):
    - Unauthenticated `GET /api/admin/check` returned HTTP 401.
    - Customer `GET /api/admin/check` returned HTTP 403.
    - Admin `GET /api/admin/check` returned HTTP 200.

### Scenario 5: Revoking admin role removes access immediately on next request
- **Result:** PASS
- **Evidence:** Verified in:
  - `db/tests/admin-role-gate.test.ts` ("Scenario 5: Revoking admin role removes backoffice access immediately on next request"):
    - Active admin session initially returns `status: "authorized"`.
    - Calling `revokeAdminRole(db, accountId)` deletes the admin role row from `account_role`.
    - Subsequent call to `getAdminSession` with identical session cookie immediately returns `status: "forbidden"` with no caching.
    - Calling `grantAdminRole(db, accountId)` immediately restores `status: "authorized"`.
  - Live Dev Server Verification (Port 3015):
    - Under active admin session cookie on port 3015, deleted `admin` role from database for `admin@j-armando.store`.
    - Immediate subsequent `curl -s -b cookies.txt http://localhost:3015/api/admin/check` returned HTTP 403 without restarting server or expiring token.
    - Restoring `admin` role immediately brought back HTTP 200.

---

## Verification Suite Results

- `CI=true ./init.sh`:
  - Lint: `pnpm lint` passed with zero errors, zero warnings.
  - Typecheck: `pnpm typecheck` passed with zero errors.
  - Tests: `vitest run` passed across 76 test files / 568 tests.
- `pnpm build`: Next.js 16.4.0 Turbopack production build succeeded.
- Live dev server smoke check on port 3015 against PostgreSQL database succeeded across all scenarios.

## Conclusion

The feature meets all specifications and constraints. Verdict: **ACCEPT**.
