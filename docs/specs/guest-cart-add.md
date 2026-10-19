# Feature Implementation Spec: Guest adds a variant to the cart

## Source Feature

- `id`: `guest-cart-add`
- `area`: `shopping`
- `depends_on`: `["product-variant-selection"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Let a shopper with no account pick a quantity for the currently selected size/color variant and add it to a cart that is identified by an opaque, httpOnly session cookie. The cart is stored in the existing `cart` / `cart_line` tables with `account_id` left null (guest ownership). Adding the same variant again must increase the existing line through the `(cart_id, variant_id)` unique key instead of creating a duplicate. The shopper can then open `/cart` and see the line, its quantity, its unit price and the integer-cent subtotal.

This slice is **add + view only**. Editing quantities, removing lines, stock caps, checkout, payment, account linking, cart merging and session expiry belong to later features.

## Non-Goals

- Editing a line quantity, removing a line, cart-line steppers or subtotals recalculation on edit (owned by `guest-cart-manage`).
- Enforcing a cumulative quantity against `variant.stock_qty` or reserving stock (owned by `cart-stock-limits` / `stock-reservation`). This feature only rejects variants that cannot be selected at all: discontinued, out-of-stock or unpublished.
- Checkout, shipping method, sales tax, payment, order creation, account creation/linking, cart-to-account merge.
- Sign-in, accounts, auth middleware, cart badges in a site-wide header, cart drawers, cross-sell, wishlist.
- Cart expiry/abandonment cleanup, session-token rotation, cart sharing across devices/browsers.
- Any schema change or migration: `cart` and `cart_line` already exist.
- Virtual try-on, chat, fit recommendation.

## Job Story

When I have chosen a size and color on a product page and I am ready to buy,
I want to choose how many I want and put that exact variant in a cart without creating an account,
so I can continue shopping and later check out with the item waiting for me.

## Users And Permissions

- **Guest (anonymous shopper):** can add any addable variant to their own session cart and view it at `/cart`. No sign-in, account or personal data required.
- **Guest isolation:** a cart is reachable only through the opaque `ja_cart_session` httpOnly cookie. No cart id, line id or session token is accepted from the request body or query string.
- **Customer/Admin:** behave exactly like a guest in this slice; no account session exists yet.
- **Server-side authority:** the client sends only a variant id and a quantity. The server re-resolves the variant against published, non-discontinued, in-stock catalog rows and resolves price from the database; client-supplied prices are never trusted.

## Acceptance Scenarios

### Scenario 1: Adding a variant with quantity 2 creates one line with quantity 2 (verification bullet 1)

Given a seeded, published product with an in-stock variant `double-breasted-linen-blazer` M / Ivory and a guest with no cart cookie
When the guest selects M / Ivory, sets Quantity to 2 and activates "Add to cart"
Then exactly one active `cart` row is created with `account_id = null` and a unique opaque `session_token`
And exactly one `cart_line` row exists for that cart and variant with `quantity = 2`
And the confirmation states the item was added and links to `/cart`.

### Scenario 2: Adding the same variant again increases the existing line (verification bullet 2)

Given the guest from scenario 1 has one line for M / Ivory with quantity 2
When the guest adds the same variant again with quantity 2 (or 1)
Then the existing `cart_line` row's quantity becomes 4 (or 3)
And no second row exists for that `(cart, variant)` pair
And the cart page shows one line with the increased quantity and a matching line subtotal.

### Scenario 3: Guest cart identity is session-scoped and account-free

Given two browsers with no cart cookie
When each adds a variant
Then each receives its own `ja_cart_session` cookie and its own cart
And neither cart's lines are visible to the other cookie
And `cart.account_id` stays null in both cases (no account is created or required).

### Scenario 4: The cart page reflects the new line in USD

Given a guest cart containing a base-price line and/or a price-override line
When the guest opens `/cart`
Then each line shows the product name, size, color, quantity, unit price and line subtotal
And the subtotal is the sum of integer-cent line totals rendered with `formatPriceUSD`
And the page states that prices are USD and tax-exclusive
And no edit, remove, quantity-stepper or checkout controls are rendered.

### Scenario 5: Invalid adds are rejected without writing

Given a guest cart (or no cart)
When a POST to `/api/cart/lines` names an unknown variant, a discontinued variant, an out-of-stock variant, a variant of a draft/archived product, a malformed variant id, or a quantity that is not an integer from 1 to 10
Then the response is 400 with an English error message
And no cart or cart line is created or changed by that request.

### Scenario 6: A guest without a cart sees an empty cart, and reads never mint a cart

Given a browser with no cart cookie
When the guest opens `/cart`
Then the page shows "Your cart is empty." with a link to `/catalog`
And no `cart` row is created and no cookie is set by the read.

### Scenario 7: Concurrent adds of the same variant converge on one line

Given a guest cart
When two add requests for the same variant and quantity arrive concurrently
Then both succeed, exactly one `cart_line` row exists for that variant, and its quantity equals the sum of both added quantities.

## Repository Research

### Files Inspected

- `db/schema/cart.ts` — `cart` has `id`, unique-not-null `session_token` ("Guest session cookie value; one active cart per session"), nullable `account_id`, `status` (`active|converted|expired`), timestamps. `cart_line` has `cart_id`, `variant_id`, `quantity`, unique `uq_cart_line_cart_variant`, check `quantity > 0`.
- `db/schema/catalog.ts` — `variant` carries `stock_qty`, `discontinued`, nullable `price_override_cents`; `product` carries `base_price_cents`, `currency = 'USD'`, `status`.
- `db/catalog.ts` — repository conventions (`Db` handle first, Drizzle query builder, published-only filters, integer cents, `formatPriceUSD` re-export), `getPublishedProductBySlug` and variant availability rules.
- `db/client.ts`, `db/tests/harness.ts`, `db/tests/product-variant-selection.test.ts` — embedded-PostgreSQL integration pattern (`createTestDatabase`, `migrateDatabase`, `seedCatalog`) used for cart tests.
- `app/products/[slug]/page.tsx`, `variant-selector.tsx`, `variant-selection.ts` — selected variant is a `ProductDetailVariant` in client state; selection is only valid when the exact pair exists with `stockQty > 0`; price is `priceOverrideCents ?? basePriceCents`.
- `app/api/try-on/route.ts` + `route.test.ts`, `app/api/chat/route.ts` — mutating route-handler precedent (validation, typed JSON errors, `Cache-Control: no-store`, injectable/mocked seams, `// @vitest-environment node` tests).
- `app/products/[slug]/try-on-panel.tsx` + test — client `fetch` mutation pattern, loading/success/error state, `vi.stubGlobal("fetch")` in tests.
- `app/layout.tsx` — no site header; the cart page must be reached from the product page and by URL.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` — Next 16 `cookies()` is async; `.set` is allowed in Route Handlers and Server Functions, not during Server Component rendering.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler signatures and response conventions.
- `CONTEXT.md`, `docs/domain-model.md`, `docs/user-and-access-model.md` — Cart/CartLine vocabulary, guest cart is session-scoped and `account_id` stays null until payment; discontinued variants cannot be added.
- `CONSTRAINTS.md`, `ARCHITECTURE.md`, `DESIGN.md` — integer cents, generated migrations only, insert-if-missing seeds, self-contained tests, layering, zero-radius editorial UI.

### Existing Patterns To Follow

- Data access goes through a repository module; pages/routes never query tables directly.
- Mutations that need request/response control use route handlers with typed JSON bodies, explicit 400/503 responses and `Cache-Control: no-store`.
- Client components receive serializable data and use `fetch` for mutations with local loading/success/error state.
- Money stays integer cents until rendered by `lib/money.ts`'s `formatPriceUSD`.
- Tests: Vitest `ui` (jsdom) for components/pure logic/routes, Vitest `db` (embedded PostgreSQL 17) for SQL behavior; `data-testid` hooks.
- English copy, zero-radius, hairline borders, no new accent colors.

### Current Gaps

- No cart repository, no cart route, no cart identity/cookie module, no add-to-cart UI.
- `variant-selector.tsx` renders price/stock but has no purchase control.
- No `/cart` page and no route to read a session cart.
- No test covers `cart` / `cart_line` writes beyond the schema smoke test.
- No migration is needed; the schema already supports guest carts.

## Technical Approach

### 1. Guest cart identity (`app/cart/session.ts`, create)

Server-only module (imported by the cart route and `/cart`; never by a client component):

- `CART_SESSION_COOKIE = "ja_cart_session"`.
- `readCartSessionToken(): Promise<string | undefined>` — `await cookies()`, return the trimmed cookie value if non-empty. Never set anything.
- `createCartSessionToken(): string` — generate `randomBytes(32).toString("base64url")` **without** touching cookies, so the route can attempt the write before committing to an identity.
- `setCartSessionCookie(token: string): Promise<void>` — set the cookie with `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `path: "/"`, `maxAge: 60 * 60 * 24 * 30` (30 days). The add route calls this **only after a successful add** and only when the request had no existing token; rejected (400) and failed (503) adds must not set it.
- The token is the **only** cart credential. The cookie is opaque, non-guessable and httpOnly (no client JS access). `cart.session_token` stores the same value.
- Do not create a cart while reading.

### 2. Cart repository (`db/cart.ts`, create)

Mirror `db/catalog.ts`: `Db` first, Drizzle only, no HTTP/Next imports, integer cents.

- `AddableVariant` and `getAddableVariant(db, variantId)` — join `variant → product`, require `product.status = 'published'`, `variant.discontinued = false`, `variant.stock_qty > 0`; return `{ variantId, productId, productSlug, productName, size, color, priceOverrideCents, basePriceCents, stockQty, currency }` or `undefined`.
- `getOrCreateCart(db, sessionToken)` — select `cart` by `session_token`; if absent insert with `sessionToken` (`onConflictDoNothing` on the unique token, then re-select for the concurrent case). Never create a second cart for one token; never set `accountId`.
- `addVariantToCart(db, sessionToken, variantId, quantity)` — in one transaction: resolve the addable variant (return `{ ok: false, reason: "variant_unavailable" }` when absent **before** creating a cart), get/create the cart, then upsert on the unique `(cart_id, variant_id)`:
  `insert ... onConflictDoUpdate({ target: [cartLine.cartId, cartLine.variantId], set: { quantity: sql\`${cartLine.quantity} + ${quantity}\` } })`
  and touch `cart.updated_at`. Return `{ ok: true, cartId, lineId, lineQuantity }`.
- `getCartSummary(db, sessionToken)` — one joined query (`cart → cart_line → variant → product`) filtered by `session_token` and `cart.status = 'active'`, ordered by product name, size, color. Return `undefined` when no active cart, otherwise `{ lines, lineCount, subtotalCents, currency }` where `unitPriceCents = priceOverrideCents ?? basePriceCents`, `lineTotalCents = unitPriceCents * quantity`, and `subtotalCents` is their integer sum. All values stay integer cents.
- No status transitions, deletes or account linking in this slice.

### 3. Add-to-cart endpoint (`app/api/cart/lines/route.ts`, create)

`POST` with `Content-Type: application/json` body `{ variantId, quantity }`:

1. Reject non-JSON/malformed bodies and non-string `variantId` / non-integer `quantity` outside 1..10 with 400 `{ error }` before touching cookies or the DB. Validate the variant id shape (`8-4-4-4-12` hex) so an invalid uuid never reaches PostgreSQL.
2. `readCartSessionToken()`; if absent generate a token in memory with `createCartSessionToken()` — do **not** set the cookie yet.
3. `addVariantToCart(getDb(), token, variantId, quantity)`; `variant_unavailable` → 400 "This variant is no longer available." with no cookie and no write.
4. Success → if the request had no existing token, `setCartSessionCookie(token)` (the first successful add mints it; an existing cookie is reused without a redundant `Set-Cookie`). Then 200 `{ lineQuantity }` with `Cache-Control: no-store`. Do not echo the cart id or token.
5. Unexpected DB error → 503 "We could not add this item to your cart. Please try again."; log a generic message only (no cookie, cart id or PII) and set no cookie.
6. `revalidatePath("/cart")` after a successful write so the cart page is read-your-own-writes.

Route handlers are directly reachable, so all validation happens server-side; the body never selects an existing cart.

### 4. Add-to-cart control (`app/products/[slug]/add-to-cart.tsx`, create; `variant-selector.tsx`, modify)

- Client component `AddToCart({ variant }: { variant?: ProductDetailVariant })`.
- Renders a labelled Quantity `<select>` (1..10, default 1, constant `MAX_ADD_QUANTITY = 10` shared with the route via a pure `app/cart/cart-input.ts`) and an "Add to cart" submit button (solid ink, zero radius).
- With no selected variant, the button is disabled and a hint reads "Select a size and color to add to cart." (the selector already rejects out-of-stock/unoffered pairs).
- `onSubmit` prevents navigation and POSTs `{ variantId: variant.id, quantity }` as JSON to `/api/cart/lines`; disables the button while pending ("Adding…"); never sends price, product slug or a cart id.
- Success (`role="status"`): "Added to cart. {lineQuantity} × {size} / {color} in your cart." plus a `View cart` link to `/cart`. Reset the confirmation when the selected variant changes.
- API error (`role="alert"`): the server's English message. Network failure: "We could not add this item to your cart. Please try again."
- Update `variant-selector.tsx` to render `<AddToCart variant={selectedVariant} />` below the stock message; selection state stays local to the selector. Keep the existing price/stock/live-region behavior unchanged.

### 5. Cart page (`app/cart/page.tsx`, create)

- `export const dynamic = "force-dynamic"`.
- `readCartSessionToken()`; absent → empty state (no DB call, no cookie).
- `getCartSummary(getDb(), token)` in `try/catch`; DB failure → "Your cart is temporarily unavailable." with a catalog link.
- Empty summary → "Your cart is empty." + "Continue shopping" → `/catalog`.
- Otherwise render an editorial list: product name (linked to `/products/[slug]`), `Size {size} · {color}`, `formatPriceUSD(unitPriceCents)`, `Qty {quantity}`, `formatPriceUSD(lineTotalCents)`, and a hairline subtotal row (`Subtotal`, `formatPriceUSD(subtotalCents)`) with "USD, tax-exclusive. Taxes and shipping calculated at checkout."
- No quantity editing, remove buttons, steppers, checkout button, or cross-sell.

### 6. Styles (`app/globals.css`, modify)

Add `.add-to-cart*` and `.cart*` rules using existing tokens (`--color-canvas`, `--color-ink`, `--color-stone`, `--color-hairline`, `--radius: 0`): flat bottom-border quantity select, solid ink button with visible focus, hairline-separated cart lines, serif "Your Cart" heading, responsive stack at 375px. No new colors, no radius, no shadows.

### 7. Tests

DB (real embedded PostgreSQL): first add, repeat add, separate variants, session isolation, invalid/unavailable variants, concurrent adds, summary pricing with override, unknown session. UI: pure input validation, route handler, add control, cart page, and the existing variant-selector test updated to see the add control.

## Expected File Changes

- `db/cart.ts` — create; cart repository (`getAddableVariant`, `getOrCreateCart`, `addVariantToCart`, `getCartSummary`).
- `db/tests/guest-cart-add.test.ts` — create; integration coverage of scenarios 1, 2, 3, 5, 7 and summary pricing.
- `app/cart/session.ts` — create; httpOnly session cookie read/mint helpers.
- `app/cart/cart-input.ts` — create; pure input parsing/validation and `MAX_ADD_QUANTITY`.
- `app/cart/cart-input.test.ts` — create; validation unit tests.
- `app/api/cart/lines/route.ts` — create; `POST /api/cart/lines` add endpoint.
- `app/api/cart/lines/route.test.ts` — create; route validation, cookie and response tests (node environment).
- `app/cart/page.tsx` — create; session cart page.
- `app/cart/page.test.tsx` — create; cart rendering, empty and failure states.
- `app/products/[slug]/add-to-cart.tsx` — create; quantity + add client control.
- `app/products/[slug]/add-to-cart.test.tsx` — create; fetch, disabled, success and error states.
- `app/products/[slug]/variant-selector.tsx` — modify; render the add control with the selected variant.
- `app/products/[slug]/variant-selector.test.tsx` — modify; assert the add control exists and is disabled until a selectable variant is chosen.
- `app/globals.css` — modify; `.add-to-cart*` / `.cart*` styles.
- `ARCHITECTURE.md` — update; new `/cart` + `POST /api/cart/lines` surfaces, cart identity model, repository layout.
- `CONSTRAINTS.md` — update; durable guest-cart identity rule.
- `feature_list.json`, `PROGRESS.md` — update at implementation end with verification evidence (implementer, not planner).

No migration and no new dependency.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md` + `stitch_image_based_application/carrito_pasarela_de_pago_simulada/` (proposal only; Spanish copy/EUR/IVA are not specification).
- Screens or states affected: product detail purchase control (no selection / selected variant / adding / added / error), `/cart` (populated / empty / unavailable).
- New design artifact required: no — `DESIGN.md` already covers zero-radius controls, ink primary button, hairline dividers and the serif/sans pairing.
- Constraints: English copy; quantity is not a size/color chip; confirmation is textual and not color-only; visible focus; no checkout, stepper or cross-sell visuals; do not introduce a site header in this slice.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — add `/cart` (dynamic, cookie-scoped) and `POST /api/cart/lines` to the route surface, record the httpOnly guest-cart session model, the upsert semantics, `db/cart.ts` and `app/cart/` in the repository layout.
- `CONSTRAINTS.md`: update — new rule: guest cart identity MUST be resolved server-side from the httpOnly session cookie; cart/line/session identifiers MUST NOT be accepted from request input to select a cart. Reason: guest carts have no auth, so a body-supplied id would expose another shopper's cart.
- `AGENTS.md`: not needed — no new command, env var or workflow change.
- Other docs: `docs/domain-model.md` and `docs/user-and-access-model.md` already define the guest cart, CartLine and session-scoped ownership; no source-of-truth change. `CONTEXT.md` needs no change.

## Implementation Plan

1. Build `db/cart.ts` and its embedded-PostgreSQL tests: addable-variant resolution, get-or-create cart, upsert line, summary query.
2. Add the pure input module and `app/cart/session.ts`; implement `POST /api/cart/lines` with full server-side validation and cookie handling; add route tests.
3. Build `add-to-cart.tsx`, mount it in `variant-selector.tsx`, add styles; cover the client states with tests and update the selector test.
4. Build `/cart` and its tests (populated, empty, unavailable).
5. Run the gate and production build, update `ARCHITECTURE.md`/`CONSTRAINTS.md`, record evidence in `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Create `db/cart.ts` with `getAddableVariant`, `getOrCreateCart`, `addVariantToCart` (transactional upsert on `(cart_id, variant_id)`), and `getCartSummary` (integer-cent unit/line/subtotal).
- [ ] Write `db/tests/guest-cart-add.test.ts`: quantity 2 → one line; repeat add → increased quantity and one row; distinct variants → distinct lines; two session tokens isolated with `account_id = null`; unknown/out-of-stock/discontinued/unpublished rejected with no write; concurrent adds → one line with summed quantity; override/base price summary; unknown session → `undefined` without creating a cart.
- [ ] Create `app/cart/cart-input.ts` with `MAX_ADD_QUANTITY = 10`, uuid shape check and integer quantity 1..10 parsing; unit-test valid/invalid inputs.
- [ ] Create `app/cart/session.ts` with `readCartSessionToken` / `createCartSessionToken` / `setCartSessionCookie` and the documented cookie options; never create a cart on read and never set the cookie before a successful add.
- [ ] Create `app/api/cart/lines/route.ts`: JSON content-type check, input validation, token cookie, repository call, 200/400/503 mapping, `Cache-Control: no-store`, no id leakage, `revalidatePath("/cart")`.
- [ ] Write `app/api/cart/lines/route.test.ts` (node env): malformed JSON, non-JSON content type, invalid input (no cookie set), unavailable variant with and without an existing cookie (no cookie set), success `{ lineQuantity }` + cookie options, existing cookie reuse, DB failure 503 with and without a cookie (no cookie set).
- [ ] Create `app/products/[slug]/add-to-cart.tsx` with labelled quantity select (1..10), disabled hint, fetch POST, pending/added/error states and `View cart` link; reset confirmation when the variant changes.
- [ ] Render `<AddToCart variant={selectedVariant} />` from `variant-selector.tsx` below the stock message without changing existing selection behavior.
- [ ] Write `add-to-cart.test.tsx` (disabled hint, exact request body, success copy + link, API error, network error) and extend `variant-selector.test.tsx` for the mounted control.
- [ ] Create `app/cart/page.tsx` with force-dynamic, cookie read, summary mapping and populated/empty/unavailable states; write `page.test.tsx`.
- [ ] Add `.add-to-cart*` / `.cart*` styles to `app/globals.css` (zero radius, hairline, ink button, visible focus, 375px stack).
- [ ] Update `ARCHITECTURE.md` and `CONSTRAINTS.md`.
- [ ] Run `./init.sh`, `pnpm build`, and the manual browser transcript; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — exit 0; non-blocking install + lint + typecheck + test. It must not start `pnpm dev` or require a database.
- `pnpm test` — new `db` tests prove the two feature verification bullets, session isolation, validation and concurrency against embedded PostgreSQL; new `ui` tests prove input parsing, route responses/cookie, the add control states and the cart page.
- `pnpm lint` / `pnpm typecheck` — exit 0.
- `pnpm build` — exit 0 with `DATABASE_URL` unset; route table lists `/cart` and `/api/cart/lines` as dynamic and `/products/[slug]` remains dynamic.
- Manual transcript in the dedicated environment (`PORT=3001`, `DATABASE_URL` in `.env`, DB already migrated/seeded; do not modify `.env`): start `pnpm dev`, select `double-breasted-linen-blazer` M / Ivory, set Quantity 2, add → confirmation; open `/cart` → one line, `$249.00`, qty 2, subtotal `$498.00`; return and add the same variant with qty 1 → `/cart` still one line, qty 3, subtotal `$747.00`. Check the cookie is httpOnly; open a second/incognito session → empty cart, independent cart. If a mobile-reachable preview is started, provide a QR code per `AGENTS.md`. Stop the dev server afterwards.
- E2E: the repo has no persistent browser E2E harness, so focused `db` + `ui` coverage plus the manual browser transcript is the established verification surface; no E2E suite is added.

## Evidence To Capture

- `./init.sh` exit code and test counts with the new test names.
- `pnpm build` output listing `/cart` and `/api/cart/lines` as dynamic.
- DB assertions: one line with quantity 2; second add yields one row with the increased quantity; no duplicate; `account_id` null; separate tokens isolated.
- Manual transcript values for `/cart` (line, quantity, unit price, subtotal) before and after the second add, and the empty state in a fresh session.
- Updated `feature_list.json` (`guest-cart-add` status/evidence) and `PROGRESS.md`.

## Validator Checklist

- [ ] Adding a selected variant with quantity 2 creates exactly one cart line with quantity 2.
- [ ] Adding the same variant again increases the existing line; no duplicate row exists.
- [ ] Guest carts need no account and stay session-scoped: `account_id` is null and two cookies never share a cart.
- [ ] Cart identity comes only from the httpOnly cookie; no request input can select a cart.
- [ ] Unknown/discontinued/out-of-stock/unpublished variants and invalid quantities are rejected server-side with no write.
- [ ] `/cart` reflects the line with correct integer-cent unit price, line total and subtotal rendered as USD; no edit/remove/checkout controls.
- [ ] Reads never create a cart or mint a cookie; empty and DB-failure states are handled.
- [ ] No schema change or hand-edited migration; no stock-cap, order, account or checkout behavior was added.
- [ ] Accessibility: labelled quantity control, disabled hint, status/alert announcements, visible focus.
- [ ] `ARCHITECTURE.md` / `CONSTRAINTS.md`, `feature_list.json` and `PROGRESS.md` are updated correctly.

## Open Questions

- **Quantity range.** The add control offers 1..10 as an input bound only. Cumulative stock caps are deliberately deferred to `cart-stock-limits`; confirm the 1..10 range is acceptable for the demo.
- **Cart surface.** This slice exposes `/cart` plus a `View cart` link in the add confirmation rather than a site-wide header/cart badge. Confirm no badge is expected before checkout work.
- **Session lifetime.** The cookie lasts 30 days and is not rotated or refreshed. Cart expiry, abandonment cleanup, conversion to an account and guest-cart merging are deferred to later features.
- **Inactive cart rows.** If a token's cart is ever `converted`/`expired`, `/cart` treats it as empty and `getOrCreateCart` reuses the row by token; the conversion/expiry flow does not exist yet and must define this behavior when it is built.
