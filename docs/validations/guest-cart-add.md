# Validation: guest-cart-add

- Feature id: `guest-cart-add`
- Spec: `docs/specs/guest-cart-add.md`
- Validated: 2026-10-19
- Validator: `feature-validator` (independent re-run; implementer evidence not trusted)
- Claimed status on entry: `passing`
- Verdict: **revise**
- Recommended state update: keep `passing` while the finding below is repaired (or set `in_progress` during repair); the orchestrator MUST NOT persist `accepted` until F1 is closed.

## Scope Reviewed

- `db/cart.ts` — `getAddableVariant`, `getOrCreateCart`, `addVariantToCart` (transactional upsert), `getCartSummary`.
- `app/cart/session.ts` — `ja_cart_session` read/mint helpers and cookie options.
- `app/cart/cart-input.ts` — pure uuid-shape + integer quantity 1–10 validation.
- `app/api/cart/lines/route.ts` — `POST /api/cart/lines` validation, cookie identity, response mapping.
- `app/cart/page.tsx` — `/cart` populated / empty / unavailable states.
- `app/products/[slug]/add-to-cart.tsx`, `variant-selector.tsx` — quantity select, add control, mounted with the selected variant.
- `app/globals.css` — `.add-to-cart*` / `.cart*` styles.
- Tests: `db/tests/guest-cart-add.test.ts`, `app/cart/cart-input.test.ts`, `app/cart/page.test.tsx`, `app/api/cart/lines/route.test.ts`, `app/products/[slug]/add-to-cart.test.tsx`, updated `variant-selector.test.tsx`.
- Durable docs: `ARCHITECTURE.md`, `CONSTRAINTS.md`, `feature_list.json`, `PROGRESS.md`.
- Uncommitted diff only (branch `feature/guest-cart-add`, base `7e1b53b`). No `db/schema` or `db/migrations` change; no `package.json`/lockfile change.

## Checks Re-run (independent)

| Check | Command | Result |
| --- | --- | --- |
| Standard gate | `./init.sh` | exit 0; install + lint + typecheck + test; **40 test files / 294 tests passed** |
| Focused feature suites | `pnpm vitest run app/cart/cart-input.test.ts app/cart/page.test.tsx app/api/cart/lines/route.test.ts app/products/[slug]/add-to-cart.test.tsx db/tests/guest-cart-add.test.ts` | **5 files / 29 tests passed** |
| Lint | included in `./init.sh` (`eslint`) | exit 0, zero findings |
| Typecheck | included in `./init.sh` (`tsc --noEmit`) | exit 0, zero diagnostics |
| Production build (no exported DB URL) | `env -u DATABASE_URL pnpm build` | exit 0; `/cart` and `/api/cart/lines` dynamic (`ƒ`), `/products/[slug]` still dynamic, `/` and `/_not-found` static |
| Production build (DB independent) | `DATABASE_URL='postgres://nobody:nobody@127.0.0.1:1/none' pnpm build` | exit 0 with an unreachable URL, proving the build performs no DB access; only the pre-existing `db/env.ts` tracing warning |
| Live HTTP | `pnpm dev` on dedicated `PORT=3001` with the existing `.env`/seeded DB | transcript below; server stopped afterwards, port 3001 free |
| DB assertions | parameterized `pg` queries through the configured `DATABASE_URL` | counts and rows below; carts/lines restored to 0 after the transcript |

The existing `.env` was read, never modified. Next.js auto-loads `.env`, so the first build command does not literally run with no environment value; the second build pins an unreachable `DATABASE_URL` to prove the build does not need a database. No disposable DB was needed because the feature environment already provides a migrated/seeded database.

## Live Transcript (PORT 3001, seeded DB)

| Request | HTTP | Observed |
| --- | --- | --- |
| `GET /cart` with no cookie | 200 | `Your cart is empty.`, `href="/catalog"`, **no `Set-Cookie`**; DB still 0 carts / 0 lines |
| `POST /api/cart/lines` `{variantId: <unknown uuid>, quantity: 1}` with no cookie | 400 | `{"error":"This variant is no longer available."}`; **`Set-Cookie: ja_cart_session=…; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax`**; no cart/line written |
| Same for an out-of-stock variant (`6008ffe1…`, overcoat S/Camel) with no cookie | 400 | same error; **`Set-Cookie: ja_cart_session=…`**; no cart/line written |
| Same for a draft-product variant (`6c1f093b…`, cropped-tweed-jacket S) with no cookie | 400 | same error; **`Set-Cookie: ja_cart_session=…`**; no cart/line written |
| `POST` quantity `11` with no cookie | 400 | `Quantity must be a whole number from 1 to 10.`; **no `Set-Cookie`**, no write |
| `POST` `text/plain` body / malformed JSON with no cookie | 400 | `Request body must be JSON.` / `Request body must be valid JSON.`; no `Set-Cookie` |
| `POST` valid M / Ivory quantity 2 (fresh jar A) | 200 | `{"lineQuantity":2}`, `cache-control: no-store`, and a `Set-Cookie` with httpOnly/43-char base64url; no cart/line id or token in the body |
| `GET /cart` with jar A (after the first add) | 200 | one line: `Double-Breasted Linen Blazer`, `Size M · Ivory`, `$249.00`, `Qty 2`, `$498.00`, `Subtotal $498.00`, USD/tax-exclusive note; **zero** buttons/inputs/remove/edit/checkout links inside the cart |
| `POST` same variant quantity 1 with extra body fields `cartId`, `priceCents`, `sessionToken` | 200 | `{"lineQuantity":3}`; extra fields ignored (added to the cookie's own cart); **no new `Set-Cookie`** |
| `GET /cart` with jar A (after the repeat add) | 200 | still one line, `Qty 3`, `$249.00` unit, `$747.00` line total and subtotal |
| Fresh jar B: `GET /cart`, then add XL / Navy quantity 1 | 200 | empty state with no `Set-Cookie`; add returns `{"lineQuantity":1}`, its cart shows `Qty 1` and `$229.00` (override wins) |
| jar A after jar B's add | 200 | still one line `Qty 3` / `$747.00` (sessions isolated) |
| Four concurrent adds of quantity 2 (same jar C, after seeding 1) | 200 ×4 | `{"lineQuantity":5,3,7,9}`; final cart one line `Qty 9`, `$2,241.00`; one row per `(cart, variant)` |
| Three concurrent first writes with a cookie that had no cart (jar D) | 200 ×3 | `{"lineQuantity":2,4,6}`; one cart created for the token, one line with quantity 6 |
| `GET /cart` jar C after also adding XL / Navy quantity 1 | 200 | 2 lines: `$249.00` × `Qty 9` = `$2,241.00`; `$229.00` × `Qty 1` = `$229.00`; `Subtotal $2,470.00` |
| `GET /cart` with `Cookie: ja_cart_session=not-a-real-token` | 200 | empty state; no cart created |
| `GET /products/double-breasted-linen-blazer` | 200 | contains `Quantity`, `Add to cart` and `Select a size and color to add to cart.` |

Final DB state before cleanup: 4 carts (all `account_id = null`, `status = active`), 5 lines, exactly one row per `(cart_id, variant_id)` pair; the two concurrency carts held quantities 9 and 6 respectively. Cart and cart_line were then emptied so the demo DB is back to 0/0. Cookie jar confirmed `#HttpOnly_localhost … ja_cart_session <43 chars>`.

## Acceptance Scenarios

- **Scenario 1 — qty 2 creates one guest cart and one line with quantity 2: PASS.** DB test plus live POST `{"lineQuantity":2}`; cart row `account_id` null, one line quantity 2, `$249.00` unit and `$498.00` line/subtotal on `/cart`.
- **Scenario 2 — re-add increments, no duplicate: PASS.** Live qty 1 after qty 2 → `{"lineQuantity":3}`, one line, `$747.00`; DB scenario 2 asserts the same `lineId` and one row.
- **Scenario 3 — session-scoped, account-free: PASS.** Two jars produced two carts, both `account_id` null, each seeing only its own line; route never accepts a cart/line/session id from the body (extra attacker fields ignored).
- **Scenario 4 — cart reflects the line in USD, no out-of-scope controls: PASS.** Product name link, size/color, `$249.00` unit, `Qty`, line total and integer-cent subtotal through `formatPriceUSD`, USD/tax-exclusive note; zero cart buttons/inputs and no edit/remove/stepper/checkout control. Two-line override cart totals `$2,470.00`.
- **Scenario 5 — invalid adds rejected without cart/line writes: PASS (with the cookie caveat in F1).** Unknown, out-of-stock and draft variants and malformed input return 400 and write no cart/line; DB stayed at 0 carts/lines after the failed requests. The cookie side effect is the repair item.
- **Scenario 6 — empty cart read never creates/mints: PASS.** No-cookie `GET /cart` renders `Your cart is empty.` with `/catalog`, no `Set-Cookie`, no DB call/row; a bogus token also creates nothing.
- **Scenario 7 — concurrent adds converge: PASS.** Same-variant concurrent requests produced one line with the summed quantity in both the existing-cart and first-write cases.

## Findings

### Finding F1 — Rejected adds mint the guest identity cookie (Medium)

- Severity: Medium
- Evidence: `app/api/cart/lines/route.ts` lines 44–56 call `getOrCreateCartSessionToken()` (which sets the cookie in `app/cart/session.ts` lines 28–43) **before** `addVariantToCart` decides whether the variant is addable. Live reproduction with no cookie: `POST /api/cart/lines` for an unknown uuid, an out-of-stock variant and a draft-product variant each returned 400 `This variant is no longer available.` **with** `Set-Cookie: ja_cart_session=…; HttpOnly; SameSite=lax; Path=/; Max-Age=2592000`. No cart/line was written, but a session credential was issued. `app/api/cart/lines/route.test.ts` only exercises the unavailable-variant case with an existing cookie, so it asserts `cookieState.set` was not called and misses the no-cookie path. This contradicts `CONSTRAINTS.md` rule 9 ("only a successful add may [mint a cookie]"), `ARCHITECTURE.md` ("only a successful add does"), and `feature_list.json` verification bullet 3 ("rejected 400 with no write and no cookie"). It also contradicts the spec's own constraint intent even though the spec's Technical Approach step 2 currently lists cookie minting before the repository call.
- Why it matters: a request that was rejected still hands the browser an identity cookie; the durable rule and the recorded evidence are false, and the next feature (cart management/merging) would inherit a rule that does not match runtime behavior.
- Required change: make the route set `ja_cart_session` only after `addVariantToCart` returns `ok: true`, and make the unavailable-variant/DB-failure paths set no cookie. Add a no-cookie route test for the unavailable variant (and preferably for the 503 path). Update the spec's Technical Approach step 2 wording so it matches (generate the token without setting it; set it after a successful add).
- Suggested implementation:
  1. Split generation from persistence in `app/cart/session.ts`: e.g. `createCartSessionToken(): string` (pure `randomBytes` generation) and `setCartSessionCookie(token: string): Promise<void>`; keep `readCartSessionToken` unchanged. `getOrCreateCartSessionToken` may be removed or re-expressed in terms of these.
  2. In `POST`, resolve `const existing = await readCartSessionToken(); const token = existing ?? createCartSessionToken();`, then call `addVariantToCart(getDb(), token, …)`.
  3. On `ok: false` (or a thrown/503 path) return the error **without** calling `setCartSessionCookie`. On `ok: true`, if `existing === undefined`, call `setCartSessionCookie(token)` before returning `{ lineQuantity }`; then `revalidatePath("/cart")`.
  4. Extend `route.test.ts`: unavailable variant with `cookieState.value === undefined` → 400, `cookieState.set` not called, `addVariantToCart` called; success → cookie set once; 503 → no cookie.
  5. Update `docs/specs/guest-cart-add.md` Technical Approach step 2 (and its route-test task bullet if needed) and re-check `ARCHITECTURE.md`/`CONSTRAINTS.md` wording; correct the `feature_list.json` verification/evidence claim only after the behavior is true.
- Verification after fix:
  - `pnpm vitest run app/api/cart/lines/route.test.ts` — green, including the no-cookie unavailable variant.
  - Live with `PORT=3001` and no cookie: POST an unknown/out-of-stock/draft variant → 400 with **no** `Set-Cookie` and 0 cart rows.
  - Live: first valid add still returns `Set-Cookie` and `/cart` shows the line; repeat add sets no new cookie.
  - `./init.sh` exit 0, `pnpm build` exit 0.

## Security Assessment

Security checklist run against the diff: no secrets committed (`.env` untouched, gitignored); cart access is cookie-only and cross-session isolation reproduced; no cart/line/session id accepted from input and none echoed in responses; input shape validated before DB access; Drizzle parameterized queries; no client-side authorization; logs contain only a generic message + error name; no external calls. Cart mutation has no CSRF token, but `SameSite=Lax` plus a JSON content type (preflight-gated) blocks the practical cross-site form path; no rate limiting is present, which is acceptable for this MVP slice. The only security-adjacent issue is F1 (identity cookie minted on rejected requests), severity Medium.

## Documentation / Harness Assessment

- `ARCHITECTURE.md` and `CONSTRAINTS.md` additions are well-scoped and accurate **except** the "only a successful add mints" clause contradicted by F1; `feature_list.json` and `PROGRESS.md` are otherwise accurate (test counts, build route table, transcript values and cleanup matched).
- `init.sh` still runs the real gate (exit 0), does not start a dev server and needs no database.
- No browser E2E harness exists; focused DB/UI tests plus the live transcript are the repo convention and adequate for this slice.
- Non-blocking observations:
  - The `role="status"` confirmation is conditionally mounted; it satisfies the spec but a persistent live region would announce more reliably across screen readers (Low, not required here).
  - `getAddableVariant` correctly filters `product.status = 'published'`, which covers archived as well as draft; the DB test directly enumerates the draft case only (same predicate). Low, no action required.
  - No stock cap is enforced across adds (deliberately deferred to `cart-stock-limits`), and `getCartSummary` treats a converted/expired cart as empty while `getOrCreateCart` reuses the row by token (documented open question in the spec/PROGRESS).

## Implementation Repair Brief

Goal: stop issuing the `ja_cart_session` cookie for rejected or failed cart adds, restore consistency with `CONSTRAINTS.md` rule 9 and the recorded verification claim, and add the missing test.

Do:
1. Split `app/cart/session.ts` into token generation (`randomBytes`) and cookie setting; keep the read helper read-only.
2. Reorder `POST /api/cart/lines`: read/generate a token in memory, call `addVariantToCart`, and only call the cookie setter when the result is `ok: true` and the token was newly generated. Error paths (400 unavailable, 503) must set nothing.
3. Add route tests: unavailable variant with no cookie → 400 + no `Set-Cookie`; success → cookie set once; 503 → no cookie.
4. Update `docs/specs/guest-cart-add.md` Technical Approach step 2 to describe generate-then-set-after-success, and re-read `ARCHITECTURE.md` / `CONSTRAINTS.md` / `feature_list.json` for consistency.

Do not:
- add quantity editing/removal, stock caps, checkout, account linking or cart merging;
- change the schema, migrations, seed or dependencies;
- weaken rule 9 instead of fixing the route.

Run:
- `pnpm vitest run app/api/cart/lines/route.test.ts`
- `./init.sh`
- `env -u DATABASE_URL pnpm build`
- live `PORT=3001` curl for unavailable-variant-no-cookie and first-valid-add.

Update:
- `feature_list.json` `guest-cart-add` evidence (only with reproduced results);
- `PROGRESS.md` repair line.

---

## Round 2 — Re-validation after F1 repair (2026-10-19)

- Validator: `feature-validator` (independent re-run of the repaired tree)
- Claimed status on entry: `passing` (unchanged)
- Verdict: **accept**
- Recommended state update: orchestrator sets `feature_list.json` → `guest-cart-add.status = accepted` and appends the validator acceptance evidence.

### Repair Reviewed

- `app/cart/session.ts`: `createCartSessionToken()` now only generates 32 random bytes as base64url and touches no cookies; `setCartSessionCookie(token)` persists the documented options; `readCartSessionToken()` is unchanged; `getOrCreateCartSessionToken()` was removed (no live code references remain).
- `app/api/cart/lines/route.ts`: reads an existing token or generates one in memory, calls `addVariantToCart`, returns 400/503 before any cookie write, and calls `setCartSessionCookie` only when `result.ok` and `existingToken === undefined`. An existing cookie is reused without a redundant `Set-Cookie`.
- `app/api/cart/lines/route.test.ts`: 9 tests (2 new) — no-cookie unavailable → 400 with a generated 43-char token reaching the repository, zero cookie set and no revalidate; no-cookie DB failure → 503 with zero cookie; existing-cookie unavailable and 503 assert no cookie; success asserts `addVariantToCart` runs before `cookies().set`.
- `docs/specs/guest-cart-add.md`: Technical Approach step 2 and the session/task bullets now prescribe generate-in-memory → add → set-only-on-success.
- `feature_list.json` evidence and `PROGRESS.md` Session 026 record the repair and re-verification. Durable `ARCHITECTURE.md`/`CONSTRAINTS.md` wording (“only a successful add mints”) is now true.

### Checks Re-run (independent, round 2)

| Check | Command | Result |
| --- | --- | --- |
| Standard gate | `./init.sh` | exit 0; **40 test files / 296 tests passed** (was 294; +2 repair tests) |
| Focused feature suites | `pnpm vitest run app/cart/cart-input.test.ts app/cart/page.test.tsx app/api/cart/lines/route.test.ts app/products/[slug]/add-to-cart.test.tsx db/tests/guest-cart-add.test.ts` | **5 files / 31 tests passed** |
| Lint | `pnpm lint` | exit 0, zero findings |
| Typecheck | `pnpm typecheck` | exit 0, zero diagnostics |
| Production build | `env -u DATABASE_URL pnpm build` | exit 0; `/cart`, `/api/cart/lines`, `/products/[slug]` dynamic (`ƒ`); `/` and `/_not-found` static |
| Live HTTP (400/200/read) | `pnpm dev` on `PORT=3001`, existing `.env`/seeded DB | transcript below; server stopped, port 3001 free |
| Live HTTP (503) | second `pnpm dev` on `PORT=3001` with `DATABASE_URL=postgres://nobody:nobody@127.0.0.1:1/none` | 503 with zero `Set-Cookie`; real DB untouched |
| DB assertions | parameterized `pg` queries through the configured `DATABASE_URL` | 0 carts / 0 lines after rejects; 1 cart / 1 line after the valid flow; cleaned back to 0/0 |

### Round-2 Live Transcript

| Request | HTTP | Observed |
| --- | --- | --- |
| No-cookie `POST` unknown uuid | 400 | `This variant is no longer available.`; **0 `Set-Cookie`** |
| No-cookie `POST` out-of-stock overcoat S/Camel (`6008ffe1…`) | 400 | same error; **0 `Set-Cookie`** |
| No-cookie `POST` draft cropped-tweed-jacket S (`6c1f093b…`) | 400 | same error; **0 `Set-Cookie`** |
| No-cookie `POST` quantity `11` | 400 | `Quantity must be a whole number from 1 to 10.`; **0 `Set-Cookie`** |
| No-cookie `GET /cart` | 200 | `Your cart is empty.`; no `Set-Cookie` |
| DB after all rejects | — | **0 carts / 0 lines** |
| First valid add M / Ivory quantity 2 | 200 | `{"lineQuantity":2}`, `cache-control: no-store`, **exactly one** `Set-Cookie: ja_cart_session=…; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax` |
| `GET /cart` after first add | 200 | 1 line, `Qty 2`, `$249.00` unit, `$498.00` line total and subtotal |
| Repeat add same variant quantity 1 (same jar) | 200 | `{"lineQuantity":3}`; **0 `Set-Cookie`** |
| `GET /cart` after repeat add | 200 | still 1 line, `Qty 3`, `$249.00` unit, `$747.00` line total and subtotal, **0 cart buttons** |
| DB after valid flow | — | 1 cart (`account_id = null`, `status = active`) whose `session_token` equals the cookie; 1 line (variant M/Ivory, qty 3, one row per pair) |
| No-cookie `POST` with unreachable DB | 503 | `We could not add this item to your cart. Please try again.`, `cache-control: no-store`; **0 `Set-Cookie`**; log line contains only a generic message + `name: 'Error'` |

The real DB had 1 cart / 1 line before the 503 server test and the same 1 / 1 after it, so the 503 path wrote nothing. Transcript rows were then deleted (0/0), `.env` was not modified, no server/listener remains on 3001, and there is no commit.

### F1 Closure

**F1 (Medium) — CLOSED.** The generate-in-memory → add → set-only-on-success ordering is implemented and proven by tests and live HTTP. All previously rejected paths (unknown, out-of-stock, draft, malformed/out-of-range input, 503) now return no `Set-Cookie`; a first successful add mints exactly one httpOnly cookie; a repeat add with an existing cookie sets none. No cart or cart_line row is written by any rejected request.

### Regression Review

- Both feature verification bullets reproduced: qty 2 → one line qty 2; re-add qty 1 → same line qty 3, no duplicate (`$498.00` → `$747.00`).
- Session isolation, `account_id = null`, cookie-only identity, concurrency, `/cart` rendering and the no-controls rule are unchanged and covered by the re-run DB/UI suites.
- Scope/security/docs: diff only changes token generation/persistence ordering plus tests, spec wording and evidence. No new routes, controls, schema, migration, seed or dependency. No secrets; parameterized queries; no id/token echo; generic 503 log. `ARCHITECTURE.md` / `CONSTRAINTS.md` are now consistent with behavior.
- Non-blocking observations (Low, no action required): a theoretical `cookies().set` failure after a committed successful write would return 503 for a cart whose token the client never received; not reachable in normal Next.js route handling. Historical `feature_list.json` evidence entries still cite the pre-repair route count (7) and 294-test gate; the later repair/re-validation entries supersede them.

### Verdict

**accept.** F1 is independently closed; no Critical/High/Medium findings remain; the gate, focused suites, build and live two-bullet transcript pass with no scope, security or documentation regression. Recommended: persist `accepted` in `feature_list.json` and append this verdict to its evidence.
