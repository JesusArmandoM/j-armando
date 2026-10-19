# Validation Record: virtual-tryon-failure

- Date: 2026-10-19
- Worktree: `/Users/armando/Documents/tienda-worktrees/virtual-tryon-failure`
- Feature id: `virtual-tryon-failure`
- Spec: `docs/specs/virtual-tryon-failure.md`
- Implementer status: `passing` (self-verified; no commit yet)
- Verdict: **accept** (all acceptance scenarios reproduced; no critical/high findings)

## Scope Reviewed

- Spec goal, non-goals, acceptance scenarios 1–5, privacy stance, expected file changes, durable-documentation impact and validator checklist.
- Current working-tree diff (14 modified files, 5 new files) plus the new `lib/try-on/photo-validation.ts` and `app/products/[slug]/try-on-failure.ts` modules.
- `feature_list.json` → `virtual-tryon-failure` status/verification/evidence, `PROGRESS.md` Session 025, `ARCHITECTURE.md`, `CONSTRAINTS.md` and `docs/risks-and-open-questions.md`.

## Checks Rerun (independent)

### Standard gate

- `env -u DATABASE_URL -u TRYON_BASE_URL -u TRYON_MODEL -u TRYON_API_KEY -u DEVEXPERT_API_KEY -u OPENAI_API_KEY -u OPENAI_BASE_URL -u CHAT_ASSISTANT_MODEL CI=true ./init.sh` → **exit 0**.
  - `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` and `pnpm test` all passed.
  - Vitest: **37 test files / 299 tests passed** (matches the recorded +2 files / +34 tests over the 35/265 baseline).
  - The script starts no dev server and needs no database or provider key.
- `pnpm lint` → exit 0, zero ESLint errors/warnings.
- `pnpm typecheck` → exit 0, zero diagnostics.
- `pnpm build` with `.env` moved outside the repo and `DATABASE_URL`/`TRYON_*`/`DEVEXPERT_API_KEY`/`OPENAI_*`/`CHAT_ASSISTANT_MODEL` unset → **exit 0**.
  - Route table: `○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /api/try-on`, `ƒ /catalog`, `ƒ /products/[slug]`.
  - Only the pre-existing `db/env.ts` dynamic-filesystem tracing warning appears. `.env` was restored afterwards (verified present; no backup left behind).
- Focused rerun of the six affected suites → exit 0, **6 files / 73 tests** (`photo-validation` 8, adapter 13, route 17, `try-on-failure` 4, panel 17, page 14).
- Independent Node probe of the pure modules → exact 4 MiB passes; 4 MiB + 1 rejects with "Choose a photo smaller than 4 MB."; empty/GIF reject with the fixed messages; PNG/JPEG/WebP signatures detected and text/SVG not detected; `failureCopyFor` returns the timeout/provider/invalid-photo/network copy exactly as specified.

### Acceptance scenarios

- **Scenario 1 — invalid photo rejected before any provider call: PASS.** `validateTryOnPhoto` rejects empty, unsupported/missing MIME and a GIF even when oversized; `sniffImageMimeType` rejects text/SVG/truncated headers. Route tests assert 400 `invalid_photo` for an empty file, a non-image declared type and a spoofed `.png`, each with `getTryOnGarmentContext`/`getTryOnProvider` never called. Panel rejects an unsupported type locally (no fetch), clears the native input, disables the action after consent, and clears the selection on a server `invalid_photo` without offering a retry. The idle hint always shows "Choose a JPG, PNG or WebP photo up to 4 MB.", so format and size guidance is visible alongside the specific message.
- **Scenario 2 — oversized photo rejected, 4 MiB inclusive: PASS.** Unit, route and panel boundaries all pass; route accepts exactly 4 MiB and forwards exactly `MAX_TRY_ON_PHOTO_BYTES` bytes to the provider; panel clears a >4 MiB selection and does not call fetch.
- **Scenario 3 — timeout: PASS.** The adapter passes `AbortSignal.timeout(timeoutMs)` (default `DEFAULT_TRY_ON_TIMEOUT_MS = 30_000`), aborts a real timer after `timeoutMs`, and maps `TimeoutError`/`AbortError` from fetch or body reading to `TryOnProviderError(kind: "timeout")` with fixed copy and no bytes. The route maps that kind to 504 `provider_timeout` with `Cache-Control: no-store` and fixed text; the panel shows the timeout copy, one `role="alert"`, no result, and a "Try again" action.
- **Scenario 4 — provider error and retry: PASS.** Route maps `provider` and unexpected errors to 502 `provider_error` without forwarding the provider message; panel keeps size/color/consent and the same `File` object, retries through the same submit path, then renders exactly one successful result and clears the failure line. A network failure also maps to retryable copy.
- **Scenario 5 — page isolation: PASS.** `page.test.tsx` renders the real page, produces a 502 through the panel, then asserts one `role="alert"` (no page-level error), the product heading, `$349.00` USD price, three gallery thumbnails with a working swap, the size guide, the stock message, a working variant selection, and the `/catalog` link; the panel remains retryable. No product price/stock/cart state changed.

### Failure-response and privacy checks

- All route failures go through `fail()`, which emits only `{ error, code }` from fixed strings and always sets `Cache-Control: no-store`; success also sets it. No failure body can contain image bytes, base64, data URLs, provider URLs or provider bodies.
- `console.error` in the try-on route logs only fixed messages plus `name`/`kind`/`status`.
- `grep` over `lib/try-on`, `app/api/try-on`, the panel and the failure mapper found no `fs`/`writeFile`/`createWriteStream`/temp-file/object-storage/cache/`localStorage`/`sessionStorage`/`indexedDB` path — only two privacy comments. Panel test asserts no browser-storage writes.
- No DB/schema/migration/object-storage change (`git status` shows no `db/` change); no `package.json`/lockfile change; no image or uploaded/result artifact added. `.env` is gitignored and no secret appears in the diff (only `apiKey: "k"` test placeholders).
- The provider seam is unchanged apart from the additive `timeout` kind, `timeoutMs`, `AbortSignal.timeout` and abort mapping; endpoint, auth, multipart fields, b64/url parsing and MIME sniffing are untouched.

### Scope review

- No persistence, rate limiting, spending caps, moderation, EXIF/cropping/compression/dimension validation, HEIC/AVIF support, cart, price/stock, gallery, chat, checkout, admin or page redesign work was added.
- Consent/retention (blocking #3) remains explicitly open in `docs/risks-and-open-questions.md`, `PROGRESS.md` and the feature notes; retry reuses the already-acknowledged in-memory photo, as the spec states.
- UI copy is English. The try-on panel reads only `photo-validation.ts` (pure) and type-only port types, so no server-only module enters the client bundle.

### Durable documentation and evidence

- `ARCHITECTURE.md` documents pre-provider 4 MiB/JPEG-PNG-WebP/signature validation, the 400/503/504/502 `{ error, code }` mapping, the 30 s bound and the panel's empty/invalid/loading/failure/retry states.
- `CONSTRAINTS.md` rule 9 states validate-before-provider, bounded calls, fixed failure copy/codes and no image/provider-body leakage; the section heading now covers failure handling.
- `docs/risks-and-open-questions.md` records generation-spec open question 4 as resolved (limits, timeout, failure policy, HEIC/AVIF exclusion) and keeps #3 open.
- `feature_list.json` evidence counts and test names match the actual files; `PROGRESS.md` Session 025 records the same commands and results. `feature_list.json` parses, all dependency ids exist, and the feature remains `passing` pending orchestrator acceptance.

## Findings

No Critical, High or Medium findings.

## Non-Blocking Notes

- Low (diff hygiene): `feature_list.json` also reformats the `depends_on` arrays of ~25 unrelated features from one line to multiple lines. No content changes, but it inflates the diff of the source-of-truth file. Reverting those formatting-only hunks before commit would keep the feature diff focused.
- Low (defensive correctness): the route validates that the declared type *and* the sniffed type are allowlisted but forwards the declared `photo.type` to the provider. A file that declares `image/png` while containing allowed JPEG bytes passes and reaches the provider labeled as PNG. This is not a security gap (both formats are allowed and the bytes are an accepted image); normalizing `mimeType` to the sniffed type would remove the mismatch.
- Low (docs freshness): `DESIGN.md` still lists "Decide the empty, loading and failure states for virtual try-on" as an open question although the spec and `ARCHITECTURE.md` now provisionally resolve it. The spec's durable-documentation impact did not require a `DESIGN.md` edit.
- Low (handoff wording): `PROGRESS.md` records the ephemeral worktree path as "Repository root" (it names the main checkout too). Fine for this session; consider restoring the main checkout path when the orchestrator merges.
- Test coverage note: `no-store` is asserted on representative 400/503/504/502 paths rather than every branch, but all failures share the centralized `fail()` helper, so the behavior is guaranteed by construction.
- No browser E2E harness exists; focused Vitest route/UI tests plus the real-page regression are the repository's established substitute, as the spec states.

## Security Assessment Summary

- Secrets: none committed; `.env` ignored; test keys are placeholders; provider credentials stay server-side.
- Access: try-on remains intentionally guest-public; no auth/admin capability touched; draft/archived/discontinued garments are not revealed by errors.
- Input/file handling: size and MIME checked before any catalog/provider work; magic-byte signature checked server-side before transmission; empty/oversized/spoofed inputs return fixed 400s. No path/name use on disk, no execution or serving of uploaded bytes.
- Privacy/data exposure: in-memory only; no persistence, cache, browser storage, temp files or logging of bytes/base64/provider URLs/bodies; `no-store` on every response; consent #3 stays open.
- External services: outbound URL comes from server-side env; one bounded request to the configured gateway; no provider URL is fetched server-side; failures expose no upstream body.
- Dependencies/tooling: no new dependency, lockfile or build-artifact change.

## Documentation / Harness State

- `ARCHITECTURE.md`, `CONSTRAINTS.md` and `docs/risks-and-open-questions.md` are consistent with the implementation; #3 remains open.
- `feature_list.json` (`passing`) and `PROGRESS.md` evidence are accurate and rerunnable.
- `init.sh` executes the real non-blocking gate (install + lint + typecheck + test), fails on errors and never starts a dev server.

## Verdict

**accept.** All five acceptance scenarios pass with offline, key-free evidence; the standard gate and production build pass without provider/DB configuration; privacy, scope and documentation requirements hold. Recommended orchestrator action: set `virtual-tryon-failure.status` to `accepted`, append this validation record reference to `feature_list.json`/`PROGRESS.md`, and optionally apply the Low hygiene notes before commit.
