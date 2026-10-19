# Validation Record: virtual-tryon-generation

- Date: 2026-10-19
- Worktree: `/Users/armando/Documents/tienda-worktrees/virtual-tryon-generation`
- Branch: `feature/virtual-tryon-generation`
- Feature id: `virtual-tryon-generation`
- Spec: `docs/specs/virtual-tryon-generation.md`
- Implementer status: `passing` (no commit yet)
- Round 1 verdict: **revise** (one documentation contradiction; code, tests, privacy behavior and scope pass)
- Round 2 verdict: **accept** (finding closed by docs-only repair; no code/test/migration/dependency/scope change; gate green)

## Scope Reviewed

- Spec acceptance scenarios 1–7, privacy stance, scope boundaries and durable-documentation impact.
- Current working tree diff plus new `lib/try-on/`, `app/api/try-on/`, try-on panel, DB context test and docs.
- `feature_list.json` → `virtual-tryon-generation` verification/evidence and `PROGRESS.md` Session 015.

## Checks Rerun (independent)

### Standard gate

- `env -u TRYON_BASE_URL -u TRYON_MODEL -u TRYON_API_KEY ./init.sh` → exit 0.
  - `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` and `pnpm test` all passed.
  - Vitest: **25 test files / 155 tests passed** (matches the recorded count).
  - The script never starts `pnpm dev`, and it fails on gate errors.
- `env -u TRYON_BASE_URL -u TRYON_MODEL -u TRYON_API_KEY -u DEVEXPERT_API_KEY -u OPENAI_API_KEY -u OPENAI_BASE_URL -u CHAT_ASSISTANT_MODEL pnpm test` → exit 0, 25 files / 155 tests. Confirms the automated suite needs no provider key and makes no live provider call.
- `pnpm build` with `.env` temporarily moved outside the repo and all `TRYON_*` / provider keys / `DATABASE_URL` unset → exit 0.
  - Route table: `○ /`, `○ /_not-found`, `ƒ /api/chat`, `ƒ /api/try-on`, `ƒ /catalog`, `ƒ /products/[slug]`.
  - `/api/try-on` is dynamic and `/products/[slug]` remains dynamic.
  - The known pre-existing Turbopack tracing warning from `db/env.ts` still appears; it is not introduced by this feature.

### Acceptance scenarios

- **Scenario 1** — route happy path and panel result tests pass (`returns the generated image and a no-store response on the happy path`; `displays the single generated result with meaningful alt text`). One result element; alt text names the product and selected color.
- **Scenario 2** — panel test asserts `productSlug`, `size`, `color`, `photo` and `consent=accepted` are sent; route test asserts `getTryOnGarmentContext(slug, "M", "Camel")` and a prompt containing product/color/size/composition; unknown/draft/archived/discontinued cases return 400 before a provider call. DB test independently confirms exact published + non-discontinued resolution and rejection cases.
- **Scenario 3** — adapter contract test asserts the exact endpoint `https://inference.devexpert.io/v1/images/edits` for the `.env` base, Bearer auth, multipart `model`/`prompt`/`image`/`n`, `b64_json` preference and URL fallback, MIME sniffing, and typed errors for non-2xx/malformed/transport failures. The in-process `node:http` test sends a real multipart request and receives an OpenAI-shaped response.
- **Scenario 4** — route and panel tests swap the provider implementation behind the port and still return/render the result unchanged.
- **Scenario 5** — route tests assert `Cache-Control: no-store` on 200, 400, 502 and 503. Panel test asserts no `localStorage`/`sessionStorage` writes. Source scan (see below) found no `fs`, temp-file, object-storage, DB-write or browser-storage path in the try-on sources.
- **Scenario 6** — panel test keeps the Try on button disabled until a photo is selected and consent is checked; route test returns 400 for missing consent and never resolves the garment or calls the provider.
- **Scenario 7** — route tests return 503 for missing configuration and 502 for provider failure; panel test renders one generic error line, does not render the provider body, and remains usable for a later attempt.

### Live provider check (independent, metadata only)

The exported `DEVEXPERT_API_KEY` and the gitignored `.env` values (`TRYON_BASE_URL=https://inference.devexpert.io/v1`, `TRYON_MODEL=image-edit`) were used to call the real adapter through `getTryOnProvider()` with a synthetic 512×512 PNG generated outside the repo.

- Result: success in ~4.5 s, `kind=base64`, `mimeType=image/jpeg`, decoded image 516,032 bytes (JPEG-signature bytes detected by the adapter).
- The script printed only non-sensitive metadata; the synthetic photo and provider result were never written to the repo and the temporary directory was deleted.
- This independently confirms the configured base URL reaches the real `/v1/images/edits` endpoint (no duplicate `/v1`) and that the gateway returns a usable base64 image.

### Privacy and source scans

- `grep` over `lib/try-on`, `app/api/try-on` and `try-on-panel.tsx` found no `fs`/`writeFile`/`createWriteStream`/temp-file/object-storage/cache/localStorage/IndexedDB writes. The only matches were comments and the test assertions for `no-store` / storage behavior.
- `console.*` in the try-on route is limited to fixed messages plus `name`/`kind`/`status`; no photo bytes, base64, data URLs, provider URLs or provider bodies are logged.
- No provider-result download exists: the adapter makes one `fetch` to `/images/edits`; the URL fallback is returned to the browser untouched and the test asserts only one fetch call.
- `git status` shows no migration, table, uploaded image or result artifact. `db/schema/index.ts` only updates the schema comment to record that try-on has no table. No `package.json` / lockfile change.
- `.env` is gitignored; `.env.example` contains placeholders/comments only, no secret.
- `getTryOnGarmentContext` is a parameterized Drizzle select joining `product`/`variant` with `status = 'published'`, exact `size`/`color`, `discontinued = false`, and `limit(1)`.

### Scope review

- The try-on-local size/color picker only supplies garment context; the product price, stock copy, cart and purchase behavior are untouched.
- No variant-selection feature, invalid/oversized-photo validation, timeout policy, retry UX, rate limiting, chat/admin/checkout changes, persistence, gallery/slider, fit prediction or cross-sell were added.
- No live provider call is made by the automated gate; no browser E2E harness exists, so focused route/UI/DB tests plus the opt-in live check are the stated substitutes.

## Findings

### Finding 1 (Medium): Risks document states the wrong try-on endpoint

- Severity: Medium
- Round 1 evidence: `docs/risks-and-open-questions.md` line 10 used the endpoint wording with a duplicate `/v1` segment (`{TRYON_BASE_URL}` followed by `/v1/images/edits`); line 32 said the same. The configured `TRYON_BASE_URL` already includes `/v1` (`.env.example`, `ARCHITECTURE.md` and `lib/try-on/index.ts`), and the adapter appends only `/images/edits` (`lib/try-on/openai-images-try-on-provider.ts`). The implementation and contract test correctly use `https://inference.devexpert.io/v1/images/edits`.
- Why it matters: this is a durable planning/handoff document. A future session following it could set `TRYON_BASE_URL` to the host (`https://inference.devexpert.io`) and then call `https://inference.devexpert.io/images/edits` (missing `/v1`), or otherwise duplicate the version segment. It contradicts the authoritative `.env.example` and `ARCHITECTURE.md` and the spec's explicit "no second `/v1`" rule.
- Required change: make both references consistent with the actual contract: `POST {TRYON_BASE_URL without trailing slashes}/images/edits`, noting that `TRYON_BASE_URL` includes `/v1`.
- Suggested implementation:
  1. Edit `docs/risks-and-open-questions.md` line 10 to `POST {TRYON_BASE_URL}/images/edits` (base includes `/v1`).
  2. Edit line 32 the same way.
  3. Scan the docs for any remaining duplicate-version references (`{TRYON_BASE_URL}` followed by `/v1/images/edits`).
- Verification after fix:
  - `grep -nE 'TRYON_BASE_URL[^ ]*/v1/images/edits' docs/risks-and-open-questions.md` → no matches (no duplicate-version endpoint).
  - `grep -n '{baseUrl}/v1/images/edits' docs/risks-and-open-questions.md docs/specs .env.example ARCHITECTURE.md` → no matches.
  - `grep -rn 'images/edits' docs/risks-and-open-questions.md .env.example ARCHITECTURE.md` → consistent wording.
  - `./init.sh` still exits 0 (docs-only change; no code behavior change).

## Non-Blocking Notes

- `POST /api/try-on` returns `TryOnProviderError.message` for 5xx responses. The configuration message names environment variables (not their values); this is not a secret or photo-data leak, but a future hardening pass could return a fixed generic 5xx body while keeping the typed diagnostic in server logs.
- MIME/size/dimension validation, timeouts, retry behavior and rate limiting are intentionally absent; they are owned by `virtual-tryon-failure` per the spec.
- No browser E2E harness exists in this repository; focused Vitest coverage plus the opt-in live provider check is the repository's established substitute.
- `PROGRESS.md` line 5 still names the base checkout path rather than this worktree; this is pre-existing and outside this feature's scope.
- The `ARCHITECTURE.md` heading calls `POST /api/try-on` "private, mutating"; the route is intentionally guest-accessible. The spec uses the same "private/no-store" shorthand, so this is a wording note, not a behavior finding.

## Security Assessment Summary

- Secrets: no secrets in the diff; `.env` ignored; `.env.example` placeholders only; live check used an exported key and printed no key material.
- Access: try-on is intentionally public/guest; no admin/authenticated capability. No auth bypass was added.
- Input/injection: structural form validation, enum size check, parameterized Drizzle lookup, server-built prompt; client input cannot become free-form prompt text. File type/size limits are explicitly deferred to the failure feature.
- Data exposure/privacy: no persistence, logging, server-side URL download, cache or browser storage; `Cache-Control: no-store` on all route responses including errors; no draft/archived disclosure.
- External services: provider URL comes from server-side env; Bearer key server-side only; no key in the client; automated tests use injected fetch/loopback HTTP only.
- Dependencies/tooling: no new dependency; build artifacts are ignored.

## Documentation / Harness State

- `ARCHITECTURE.md`: updated for the route, `lib/try-on/`, realised `TryOnProvider`, `TRYON_*` configuration and no try-on table. Correct except the non-blocking "private" wording.
- `CONSTRAINTS.md`: rule 7 accurately states the in-memory-only privacy rule and no-store/log requirements.
- `.env.example`: documents `TRYON_BASE_URL` including `/v1`, `TRYON_MODEL` and the optional `TRYON_API_KEY` fallback, with no secrets.
- `docs/risks-and-open-questions.md`: #2 is recorded as resolved and #3 remains open; the two endpoint references were corrected in round 2 and now agree with `.env.example`, `ARCHITECTURE.md` and the adapter.
- `feature_list.json` and `PROGRESS.md`: status/evidence counts are accurate; `feature_list.json` remains `passing` pending orchestrator acceptance.
- `init.sh`: executes install + lint + typecheck + test and exits 0 without a dev server or database.

## Round 2 Re-validation (2026-10-19)

- Finding 1 closed: `docs/risks-and-open-questions.md` lines 10 and 32 now use `POST {TRYON_BASE_URL without trailing slashes}/images/edits` and explicitly state that `TRYON_BASE_URL` includes `/v1`. The authoritative `.env.example`, `ARCHITECTURE.md`, spec and `lib/try-on/openai-images-try-on-provider.ts` still agree; no duplicate-version reference remains in those docs.
- No code/test/migration/dependency/scope change from the repair: implementation files under `lib/try-on/`, `app/api/try-on/`, the panel and DB test retain their pre-repair modification times; `git status` shows no migration, package/lockfile, image or result artifact. The repair touched only `docs/risks-and-open-questions.md`, `docs/validations/virtual-tryon-generation.md`, `feature_list.json` and `PROGRESS.md`.
- `env -u TRYON_BASE_URL -u TRYON_MODEL -u TRYON_API_KEY -u DEVEXPERT_API_KEY -u OPENAI_API_KEY -u OPENAI_BASE_URL -u CHAT_ASSISTANT_MODEL ./init.sh` → exit 0; 25 test files / 155 tests.
- `pnpm build` with `.env` moved aside and all `TRYON_*` / provider keys / `DATABASE_URL` unset → exit 0; route table still includes `ƒ /api/try-on` and `ƒ /products/[slug]`.
- Privacy/scope conclusions from round 1 still hold: source scans found no `fs`/temp-file/object-storage/browser-storage path in the try-on sources, route logging remains fixed/typed only, and the route/panel scope is unchanged.
- Process note: the implementer edited this validator-authored record to paraphrase the old endpoint pattern so the repo-wide grep would be literally clean. That edit is inappropriate: a validation record is evidence, not a product document, and must not be rewritten by the implementer. The finding, severity and verdict were not changed, but the recorded verification command was also loosened. The correct gate is scoped to the authoritative docs (`docs/risks-and-open-questions.md`, `docs/specs`, `.env.example`, `ARCHITECTURE.md`) and must exclude `docs/validations/`; this record retains the historical finding so the audit trail is not erased. No further code repair is required.

## Verdict

Round 1: **revise** — the implementation satisfied the behavioral spec and privacy hard constraint; one durable-document endpoint contradiction (Medium) had to be corrected.

Round 2: **accept** — Finding 1 is closed; the repair was docs-only; no code/test/migration/dependency/scope change; gate green. The feature status remains `passing` for the orchestrator to persist as `accepted`; this record does not mark it accepted itself.

## Implementation Repair Brief

Goal: make the risks document describe the already-correct try-on endpoint contract, then re-verify the documentation consistency.

Do:
1. In `docs/risks-and-open-questions.md` line 10, replace the duplicate-version endpoint wording (`{TRYON_BASE_URL}` followed by `/v1/images/edits`) with `POST {TRYON_BASE_URL without trailing slashes}/images/edits` and state that `TRYON_BASE_URL` includes `/v1`.
2. In the same file line 32, make the same replacement.
3. Search the docs for any other duplicate-version endpoint wording and remove the duplicate `/v1` segment.

Do not:
- Change `lib/try-on/`, `app/api/try-on/`, the panel, the DB query, tests, migrations or package dependencies.
- Add persistence, logging, MIME/size validation, timeouts, retry UX or rate limiting.
- Change the feature status or weaken the spec/privacy constraints.

Run:
- `grep -nE 'TRYON_BASE_URL[^ ]*/v1/images/edits' docs/risks-and-open-questions.md` → expect no duplicate-version matches.
- `grep -rn 'images/edits' docs/risks-and-open-questions.md .env.example ARCHITECTURE.md` → expect consistent `{TRYON_BASE_URL}/images/edits` wording.
- `./init.sh` → exit 0 (docs-only change; confirm no regression).

Update:
- `feature_list.json` evidence with the correction.
- `PROGRESS.md` Session 015 or a short follow-up entry.
- Return to `feature-validator` for re-validation; do not mark `accepted` yourself.
