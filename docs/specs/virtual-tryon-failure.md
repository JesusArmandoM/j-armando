# Feature Implementation Spec: Virtual try-on fails gracefully

## Source Feature

- `id`: `virtual-tryon-failure`
- `area`: `ai`
- `depends_on`: `["virtual-tryon-generation"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

When a photo cannot be used, or the try-on provider times out or errors, the product-page panel must explain what happened in plain English and offer a usable retry. Failures stay local to the panel: gallery, variant/price/stock selection and catalog navigation keep working. Invalid or oversized photos are rejected before any provider call, and provider calls are bounded by an explicit timeout.

This hardens the accepted `virtual-tryon-generation` seam. It does not add persistence, change the provider, or build cart/purchase behavior.

## Non-Goals

- No persistent storage: no DB table/column/migration, object storage, disk/temp files, cache or browser storage. Photo consent/retention (blocking #3) stays open.
- No new provider and no provider-contract redesign. The only port change is a typed `"timeout"` failure kind; `TryOnProvider` still exposes `generateTryOn`.
- No rate limiting, spending caps, abuse prevention, virus scanning, moderation, EXIF stripping, cropping, compression, dimension validation or HEIC/AVIF support.
- No retry/backoff policy beyond a user-initiated retry; no cart/add-to-cart (`guest-cart-add` owns it), price/stock, gallery, chat, checkout or admin changes.
- No browser E2E harness; the repo has none and uses focused Vitest coverage.

## Job Story

When my photo is rejected or the try-on fails, I want to understand what went wrong and retry without losing my place, so a failed preview does not stop me from evaluating or shopping the garment.

## Users And Permissions

- Guest or customer (anonymous): may use try-on on any published product with a non-discontinued variant; no account or session required.
- No admin/authenticated capability is involved.
- Draft, archived and unknown products and discontinued variants stay unavailable and must not be revealed by errors.
- Photos and results remain in request/component memory only; no role gains access after the response.

## Acceptance Scenarios

### Scenario 1: An invalid photo is rejected before any provider call

Given a published product's try-on panel
When the shopper chooses an empty, unsupported or non-image file, or bytes that are not PNG/JPEG/WebP
Then the panel shows a clear English message naming accepted formats and the size limit
And the action cannot submit that file
And a direct request gets 400 code `invalid_photo`
And `getTryOnGarmentContext` and `getTryOnProvider` are never called.

### Scenario 2: An oversized photo is rejected before any provider call

Given the shopper chooses a JPEG/PNG/WebP photo larger than 4 MiB
When the panel validates the selection
Then it shows a "smaller than 4 MB" message, clears the invalid selection and sends no request
And a direct request gets 400 code `invalid_photo` without a provider call
And exactly 4 MiB passes validation (inclusive boundary).

### Scenario 3: A provider timeout surfaces a clear failure and retry affordance

Given a valid, consented photo and published/non-discontinued garment context
When the provider does not respond within the bound
Then the adapter aborts and throws `TryOnProviderError(kind: "timeout")`
And the route returns 504 code `provider_timeout` with `Cache-Control: no-store`
And the panel shows timeout-specific copy and a "Try again" action
And no partial result is rendered.

### Scenario 4: A provider error surfaces a clear failure and retry reuses the input

Given a valid, consented photo and garment context
When the provider errors or returns an unusable response (route 502 `provider_error`)
Then the panel shows clear failure copy, keeps the photo/size/color/consent, and labels the action "Try again"
And retry sends a new request with the same in-memory photo, without re-upload
And a later success replaces the failure with the single result image.

### Scenario 5: The rest of the product page keeps working after a try-on failure

Given a try-on failure is displayed on a published product page
When the shopper continues browsing
Then the product name, USD price, gallery, variant selector, stock message, size guide and catalog link still render and respond normally
And the failure is confined to the panel's `role="alert"` region
And no exception escapes the panel and no page-level error state appears
And no cart or product-purchase state is mutated (add-to-cart arrives with `guest-cart-add`; the existing product-page behavior is the observable proxy).

## Repository Research

### Files Inspected

- `AGENTS.md`, `CONSTRAINTS.md`, `PROGRESS.md`, `feature_list.json` — rules, current state, feature metadata and the three provisional verification bullets.
- `docs/risks-and-open-questions.md`, `docs/specs/virtual-tryon-generation.md` — blocking #3 still open; invalid-photo/timeout/retry work explicitly deferred to this feature.
- `docs/build-brief.md`, `docs/mvp-scope.md`, `DESIGN.md` — graceful failure/timeout is required; `DESIGN.md` leaves try-on empty/loading/failure states open.
- `lib/try-on/` — port (only `configuration`/`provider` kinds), multipart adapter (injectable `fetch`, no timeout), lazy factory, simulated provider and prompt builder.
- `app/api/try-on/route.ts` — checks only non-empty `File`; no MIME/size/signature check or timeout mapping; returns `{ error }` with `no-store`.
- `app/products/[slug]/try-on-panel.tsx`, `page.tsx`, `page.test.tsx`, `app/globals.css` — panel idle/loading/result/generic error, page composition, test patterns, `.try-on*` styles.
- `app/api/try-on/route.test.ts`, `try-on-panel.test.tsx`, `openai-images-try-on-provider.test.ts` — offline seams (mocked provider/`fetch`, in-process HTTP).
- `vitest.config.mts`, `package.json` — `ui` (jsdom) and `db` (embedded PostgreSQL) projects; no `test:e2e`.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Next 16 route-handler conventions.

### Existing Patterns To Follow

- AI capabilities sit behind repo-owned ports; adapters accept an injected `fetch`; automated provider tests stay offline and key-free (rule 5).
- Route handlers use `force-dynamic`, `Response.json`, typed status mapping and `no-store` on every response.
- Client components use labelled native controls, `data-testid`, `role="alert"`, zero radius and the steel AI tint; pure logic lives in small testable modules (e.g. `variant-selection.ts`, `filter-params.ts`).
- Privacy rule 8: no persistence/caching/logging of photo bytes or results; only the current result lives in component state.

### Current Gaps

- No MIME/size/signature validation; a text file renamed `.png` or a 20 MB upload reaches the provider.
- No request timeout; a hung provider leaves the panel loading indefinitely.
- No timeout error kind, so timeout cannot be distinguished from a generic failure.
- The panel has one generic sentence and no retry affordance; the route returns no stable failure code.
- No test proves a try-on failure leaves the product page functional.

## Technical Approach

### 1. Shared photo validation — `lib/try-on/photo-validation.ts` (create)

Framework-agnostic, pure, no I/O:

```ts
export const MAX_TRY_ON_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MiB
export const TRY_ON_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type TryOnPhotoIssue = "empty" | "unsupported_type" | "too_large" | "not_an_image";
export type TryOnPhotoValidation = { ok: true } | { ok: false; issue: TryOnPhotoIssue; message: string };
export function validateTryOnPhoto(file: { size: number; type: string }): TryOnPhotoValidation;
export function sniffImageMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | undefined;
```

`validateTryOnPhoto` checks non-zero size, MIME allowlist, then the 4 MiB cap (exactly 4 MiB passes). `sniffImageMimeType` uses the same PNG/JPEG/WebP magic bytes the adapter recognises. Export fixed messages: "Choose a photo to try on.", "Choose a JPG, PNG or WebP photo.", "Choose a photo smaller than 4 MB.", "That file doesn't look like a JPG, PNG or WebP photo. Choose another image." The cap stays below the platform request-body limit (Vercel ~4.5 MB) after multipart overhead.

### 2. Bounded provider timeout — port + adapter (modify)

- Add `"timeout"` to `TryOnProviderErrorKind` (additive; `configuration`/`provider` unchanged).
- Add `timeoutMs?: number` to adapter options, default `30_000`; no other provider behavior changes.
- Pass `signal: AbortSignal.timeout(timeoutMs)` to `fetch`; map a `DOMException` named `TimeoutError`/`AbortError` from fetch or body reading to `TryOnProviderError(kind: "timeout")` with fixed copy and no bytes.
- Keep endpoint, bearer auth, multipart fields, b64/url parsing and MIME sniffing unchanged.

### 3. Route validation and failure codes — `app/api/try-on/route.ts` (modify)

Keep `force-dynamic`, `no-store` and the catalog → prompt → provider flow. Order:

1. Parse `formData`; malformed → 400 `{ error, code: "invalid_request" }`.
2. `photo` must be a non-empty `File` of an allowed MIME type within 4 MiB → else 400 `invalid_photo` **before** catalog/provider work.
3. Read bytes once (`arrayBuffer`, guarded); `sniffImageMimeType` must be allowed → else 400 `invalid_photo`. Reuse the bytes for the provider call.
4. Existing field/size/consent checks → 400 `invalid_request` / `not_available` / `consent_required`; preserve today's unavailable-garment copy.
5. Catalog lookup: DB failure → 503 `provider_unavailable`; no match → 400 `not_available`.
6. Provider call: `timeout` → 504 `provider_timeout`; `configuration` → 503 `provider_unavailable`; `provider` or unknown → 502 `provider_error`.
7. Return fixed `{ error, code }` copy per code; never forward provider messages. Log only fixed diagnostics (`name`, `kind`, upstream `status`).

No new route, DB write, `fs`, provider-URL fetch or stored timeout state.

### 4. Client failure copy and retry — `app/products/[slug]/try-on-failure.ts` (create) + panel (modify)

- Pure `failureCopyFor(status: number, code?: string): { message: string; retryable: boolean }`:
  - `invalid_photo` → format/size copy, not retryable.
  - `provider_timeout` → "The try-on took too long to finish. Please try again.", retryable.
  - other 4xx → "The try-on couldn't be completed. Please check your photo and try again."
  - 502/503/network → "The try-on couldn't be completed right now. Please try again.", retryable.
- Panel states:
  - **Empty/idle:** hint "Choose a JPG, PNG or WebP photo up to 4 MB."; action disabled until a valid file + consent.
  - **Loading:** unchanged "Generating your try-on…"; controls disabled.
  - **Failure:** one `role="alert"` line with mapped copy; never render server/provider text.
- On file change run `validateTryOnPhoto({ size, type })`; invalid clears file state and the native input (ref + `value = ""`), shows the message and disables the action. Set `accept="image/jpeg,image/png,image/webp"`.
- Submit clears prior error/result, sets loading, posts existing fields and parses `{ code }` on non-OK. Server `invalid_photo` also clears the file selection. After a retryable failure keep the `File`, size/color and consent, label the button "Try again", and reuse the same submit path with the same in-memory photo. Success renders the single result as today; only the current result stays in state (no storage, download link or history).

### 5. Product page isolation and styles

No `page.tsx` behavior change is expected: the panel is a client island and catches its own failures. Add a regression test that renders the real page, produces a try-on failure, then asserts name/price/gallery/variant selector/stock/size guide/catalog link are intact. Extend `.try-on*` styles only if needed for the hint, failure line and retry label (existing tokens, zero radius, hairline border, steel tint, visible focus, no colour-only signalling).

## Privacy And Security Stance

- In-memory only: no DB/storage/temp files/browser storage, no photo/result logging. Failure copy and codes contain no bytes, base64, provider URLs or bodies.
- Validation precedes the provider call, so unsupported/oversized bytes are never transmitted; the route revalidates declared type and magic bytes (the client check is convenience, not the security boundary).
- Signature checking rejects MIME spoofing; the allowlist keeps unknown formats out of the provider.
- Provider URLs are still never downloaded; `b64_json` remains preferred; `no-store` remains on every response.
- Consent/retention (#3) stays open; this feature does not weaken or finalize the interim consent gate. Retry reuses the already-acknowledged in-memory photo; whether each retry needs fresh acknowledgement is part of that review.

## Expected File Changes

- `lib/try-on/photo-validation.ts` + `.test.ts` — create; limits, allowlist, validation and sniffing.
- `lib/try-on/try-on-provider.ts`, `openai-images-try-on-provider.ts` + `.test.ts` — modify; `"timeout"` kind, `timeoutMs`, abort mapping and offline tests.
- `app/api/try-on/route.ts` + `route.test.ts` — modify; validation order, signature check, failure codes, 504, no-provider-call tests.
- `app/products/[slug]/try-on-failure.ts` + `.test.ts`, `try-on-panel.tsx` + `.test.tsx`, `page.test.tsx` — create/modify; copy mapping, empty/invalid/timeout/error/retry states, page regression.
- `app/globals.css` — modify only if needed for hint/failure/retry presentation.
- `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/risks-and-open-questions.md` — update per below; update `feature_list.json`/`PROGRESS.md` at implementation end only.

No migration, new dependency, object storage or `.env` change.

## Visual Design Impact

- UI involved: yes. Design source: `DESIGN.md`; the try-on asset remains reference-only.
- States affected: product detail try-on panel — empty/idle, loading, invalid-photo, oversized-photo, timeout, provider-error, retry, result.
- New design artifact required: no. `DESIGN.md`'s open question is resolved provisionally: idle hint with format/size, existing uppercase loading line, hairline-bordered inline failure using the existing error treatment, and a primary "Try again" action reusing the current button style.
- Constraints: English copy, Newsreader/Hanken Grotesk, warm ivory palette, hairline borders, zero radius (AI pips/swatches only), steel AI tint, visible focus, no colour-only signalling, `role="alert"` for failures.

## Durable Documentation Impact

- `ARCHITECTURE.md`: **update** — document photo validation (JPEG/PNG/WebP, 4 MiB, signature, pre-provider), 504 `provider_timeout`, the 30 s bound and the panel's empty/loading/failure/retry states.
- `CONSTRAINTS.md`: **update** — add a durable try-on rule: validation before any provider call, bounded provider timeout, and failure copy/codes free of image data/provider bodies.
- `AGENTS.md`: **not needed** — commands, startup path and workflow unchanged.
- `docs/risks-and-open-questions.md`: **update** — record the resolved upload-limit/timeout policy (generation spec open question 4); keep #3 open and note the HEIC/AVIF exclusion.
- `docs/technical-discovery.md`, `docs/domain-model.md`: **not needed** — no provider, data-model or deployment decision change.

## Implementation Plan

1. Add and unit-test shared validation, then add the timeout kind/option and adapter abort mapping.
2. Harden the route (validation order, signature, single byte read, fixed codes, 504) and prove no provider call on invalid input.
3. Add failure-copy mapping and panel empty/invalid/timeout/error/retry states plus the page regression; run the gate, scan for persistence/logging violations, update durable docs and evidence.

## Implementation Tasks

- [ ] Create `photo-validation.ts` with allowlist, 4 MiB limit, `validateTryOnPhoto`, `sniffImageMimeType` and fixed messages; test empty, unsupported types, 4 MiB boundary, all three signatures and a spoofed file.
- [ ] Add `"timeout"` to `TryOnProviderErrorKind`; add `timeoutMs` (default 30 s) and `AbortSignal.timeout` to the real adapter; map fetch/body aborts to `kind: "timeout"` with no bytes; test fetch and body timeouts.
- [ ] Reorder/harden `POST /api/try-on`: field/file checks, size/type, one `arrayBuffer` read + signature check before catalog/provider work.
- [ ] Return `{ error, code }` and map timeout → 504, provider → 502, configuration/DB → 503; keep `no-store` and fixed logs; test invalid type, oversized, spoofed signature, timeout and provider error, asserting no catalog/provider call for invalid photos.
- [ ] Create `try-on-failure.ts` with `failureCopyFor` and table-driven tests.
- [ ] Update the panel: idle hint, `accept` allowlist, preflight with input reset, mapped errors, retained input and "Try again"; test invalid/oversized no-fetch, timeout copy + retry, provider-error retry with the same photo then success.
- [ ] Add the page regression proving name/price/gallery/variant/stock/size guide/catalog link survive a try-on failure, and adjust `.try-on*` styles if needed.
- [ ] Update `ARCHITECTURE.md`, `CONSTRAINTS.md` and `docs/risks-and-open-questions.md`.
- [ ] Run the gate/build and privacy scans; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — install + lint + typecheck + test, exit 0 with all `TRYON_*` and `DATABASE_URL` unset; must not start `pnpm dev`.
- `pnpm test` — validation boundaries/sniffing; adapter timeout mapping (injected fetch); route invalid/oversized/spoofed → 400 with no catalog/provider call, timeout → 504 `provider_timeout`, provider → 502 `provider_error`, every failure `no-store`; panel no-fetch invalid, timeout copy + "Try again", same-photo retry and success; page intact after failure.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` — zero errors; build exits 0 with provider/DB variables unset and `/api/try-on`/`/products/[slug]` dynamic.
- Privacy/scope scans: `grep` try-on sources for `fs`, `writeFile`, `localStorage`, `IndexedDB`, image logging/provider bodies; confirm no migration/table/storage and no uploaded/result image artifact in `git status`.
- Optional manual check (not gating): on the product page choose a text file renamed `.png` and a >4 MB image, confirm inline messages/disabled action and that the page remains usable. No live provider call is needed.
- E2E: no browser E2E harness exists; focused Vitest route/UI/adapter tests are the established substitute.

## Evidence To Capture

- `./init.sh` exit 0 with test counts and scenario-mapped test names.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` exit 0 with provider/DB variables unset.
- Route/adapter test names proving invalid/oversized/spoofed → 400 with no catalog/provider call, timeout → 504, abort → `TryOnProviderError(kind: "timeout")` without bytes.
- Panel/page test names proving timeout/provider-error copy, "Try again", same-photo retry and that the rest of the page survives a failure.
- Privacy scan output, no DB/schema/migration/storage change, and updated `feature_list.json` verification/evidence plus a `PROGRESS.md` session entry.

## Open Questions

1. **Allowlist and iPhone photos — non-blocking.** JPEG/PNG/WebP excludes HEIC/AVIF, which some phones produce. The panel names accepted formats; client conversion or provider support is a later decision.
2. **Timeout versus hosting limit — non-blocking.** The adapter defaults to 30 s; the deployment function limit must be at least that long for the 504 to reach the shopper. Align before public launch.
3. **Final failure/consent copy and retry acknowledgement — non-blocking.** English copy is testable but subject to brand/legal review under #3. Retry reuses the acknowledged in-memory photo; whether each retry needs fresh acknowledgement is part of that review. The client checks size/type only; byte-signature validation is server-authoritative.

## Validator Checklist

- [ ] Scope is limited to validation, timeout, clear copy, retry and page isolation; no persistence, cart, fit, moderation or provider change.
- [ ] Acceptance scenarios 1–5 pass with offline tests.
- [ ] Invalid/oversized/spoofed photos return 400 before `getTryOnGarmentContext`/`getTryOnProvider` and never reach a provider.
- [ ] Timeout is bounded, maps to `kind: "timeout"` / 504 `provider_timeout`; provider errors map to 502 `provider_error`.
- [ ] Failure responses are `no-store` and contain no image bytes, base64, provider URLs or bodies.
- [ ] The panel shows distinct English messages, keeps the page usable, offers "Try again" reusing the current in-memory photo, clears invalid selections and disables the action until a valid file is chosen; a valid retry can succeed.
- [ ] No DB/schema/migration/storage/browser-storage change; photos/results stay in memory only.
- [ ] `./init.sh`, `pnpm lint`, `pnpm typecheck` and `pnpm build` pass key-free with no configured database.
- [ ] `ARCHITECTURE.md` and `CONSTRAINTS.md` updated; #3 remains explicitly open.
- [ ] `feature_list.json` and `PROGRESS.md` contain evidence; no unrelated behavior was added.
