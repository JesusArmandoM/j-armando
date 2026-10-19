# Feature Implementation Spec: Admin role gates the backoffice

## Source Feature

- `id`: `admin-role-gate`
- `area`: `backoffice`
- `depends_on`: `["account-signin-signout"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Gate the backoffice routes (`/admin` and sub-routes) and backoffice APIs so that only accounts with the `admin` role can access backoffice pages and data.
1. **Auth & Admin Guard (`lib/auth/admin-guard.ts` & `db/auth.ts`):**
   - Provide `getAdminSession(cookieStore?, db?)`:
     - Checks session cookie `ja_account_session`.
     - If missing, invalid, or expired: returns `{ status: "unauthenticated" }`.
     - If account exists and active but does not hold role `"admin"`: returns `{ status: "forbidden", account, roles }`.
     - If account holds role `"admin"`: returns `{ status: "authorized", account, roles }`.
   - Provide `grantAdminRole(db, accountId)` and `revokeAdminRole(db, accountId)` in `db/auth.ts`.
   - Because `getAccountFromSessionToken` joins `account_role` on each invocation, role changes (including revoking admin) take effect immediately on the very next request with no session caching.
2. **Seed & Setup:**
   - In `db/seed-data.ts` and `db/seed.ts`, idempotently seed a default admin account (`admin@j-armando.store` with password `Admin123!` and roles `customer` and `admin`) so that local development and manual verification work out of the box.
3. **Backoffice Shell & Layout (`app/admin/layout.tsx`):**
   - Server Component that verifies admin session before rendering child views.
   - Unauthenticated: redirects to `/account/signin?returnUrl=/admin`.
   - Forbidden: renders a dedicated editorial 403 Forbidden page (`data-testid="admin-forbidden"`) with message `"Access Denied: You do not have permission to view the backoffice."`, displaying current user email, link to switch account or sign out, and link to storefront.
   - Authorized: renders the Backoffice Shell:
     - Header with title "J. Armando Backoffice".
     - Account indicator displaying email and "Admin" role badge.
     - Navigation links: "Dashboard" (`/admin`), "Products", "Orders".
     - Return link to storefront (`/`).
4. **Dashboard View (`app/admin/page.tsx`):**
   - Title: "Backoffice Dashboard".
   - Welcome message and summary action cards for Catalog Management and Order Fulfillment.
5. **Backoffice API Guard Route (`GET /api/admin/check`):**
   - Returns 401 Unauthorized `{ ok: false, error: "Authentication required." }` when unauthenticated.
   - Returns 403 Forbidden `{ ok: false, error: "Access denied. Admin role required." }` when lacking the admin role.
   - Returns 200 OK `{ ok: true, admin: true, account, roles }` when authorized.
   - Includes `Cache-Control: no-store`.

## Non-Goals

- Product creation/editing forms (handled in `admin-product-create` and `admin-product-publish`).
- Order fulfillment state transitions (handled in `admin-order-list` and `admin-order-fulfillment`).
- Fine-grained RBAC permissions beyond `customer` and `admin` (not in MVP scope).
- Self-service admin invitation / delegation workflows (out of MVP scope).

## Acceptance Scenarios

### Scenario 1: Admin account can open the backoffice
Given an authenticated account with the `admin` role
When navigating to `/admin`
Then the backoffice dashboard loads with header "J. Armando Backoffice", navigation links, admin role badge, and welcome message.

### Scenario 2: Customer account without admin role receives 403 Forbidden
Given an authenticated account with only the `customer` role (no `admin` role)
When navigating to `/admin`
Then backoffice content is withheld and an editorial 403 Forbidden page is rendered with `data-testid="admin-forbidden"` and message "Access Denied: You do not have permission to view the backoffice."
And the customer is given links to return to the storefront or sign out.

### Scenario 3: Signed-out visitor is redirected to sign-in with returnUrl
Given a visitor without an active session cookie
When navigating to `/admin`
Then they are redirected to `/account/signin?returnUrl=/admin`.

### Scenario 4: Admin API check returns appropriate status codes
Given requests to `GET /api/admin/check`:
- When unauthenticated: returns HTTP 401 with `{ ok: false, error: "Authentication required." }`.
- When authenticated as a non-admin: returns HTTP 403 with `{ ok: false, error: "Access denied. Admin role required." }`.
- When authenticated as an admin: returns HTTP 200 with `{ ok: true, admin: true, ... }`.

### Scenario 5: Revoking admin role removes access immediately on the next request
Given an active admin session on an account
When the `admin` role is revoked from `account_role`
Then the very next request to `/admin` or `GET /api/admin/check` returns HTTP 403 Forbidden without requiring session expiration or sign-out.
