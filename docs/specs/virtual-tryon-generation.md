# Feature Implementation Spec: Shopper uploads a photo and sees a try-on result

## Source Feature

- `id`: `virtual-tryon-generation`
- `area`: `ai`
- `depends_on`: `["product-detail-page"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

On a published product detail page, let the shopper upload a photo, choose a size/color garment context, acknowledge the photo notice, trigger a virtual try-on, and see the generated image of themselves wearing the garment. The browser posts the photo and garment context to a server route; the route resolves the garment from the catalog, builds the prompt server-side, and calls a real image-edit provider through a narrow, framework-agnostic `TryOnProvider` port. The result is displayed once and lives only in request/component memory.

**Scope assumption (explicit):** `product-variant-selection` is **not** accepted and the product detail page currently has no variant selector. This feature therefore adds a try-on-local size/color picker populated from the product's existing, non-discontinued variants. That picker supplies **garment context only** — it does not change the page's displayed price, stock message, cart, or any purchase behavior. When `product-variant-selection` ships, its selected variant can be passed to the panel instead, and this local picker can be removed without changing the port, route, or provider contract.

## Non-Goals

- Product variant selection, variant-driven price/stock, add-to-cart or quantity (owned by `product-variant-selection` / `guest-cart-add`).
- Invalid/oversized-photo validation, timeouts, clear failure copy, retry affordances and rate limiting (owned by `virtual-tryon-failure`). This slice only surfaces typed errors minimally.
- Persisting photos or results: no `try_on_session` / `photo` tables, no migration, no object storage, no temp files, no history, no account linkage.
- Final photo consent text, legal basis, retention window, deletion flow, minors policy, provider DPA review (blocking question #3 remains open).
- Multiple outputs, comparison slider, gallery history, garment compositing controls or fit prediction (FITIQ is out of MVP).
- Chat assistant, admin, checkout, cart, catalog listing or product-detail copy changes.
- Provider quality/cost evaluation, spending caps, abuse prevention and image moderation.

## Job Story

When I am considering a garment on its product detail page,
I want to upload a photo and see how that size/color looks on me,
so I can judge the drape and proportion before deciding to buy.

## Users And Permissions

- Guest or customer (anonymous): can use try-on on any published product; no account, session, cookie or personal profile is required.
- No admin or authenticated capability is involved.
- Draft, archived and unknown products, and discontinued variants, cannot be used as try-on context and must not be revealed by the API.

## Acceptance Scenarios

### Scenario 1: Valid photo produces a displayed result

Given a published product detail page with at least one non-discontinued variant
When the shopper selects a variant, chooses a valid image file, accepts the photo notice and triggers try-on
Then the page shows a loading state while the request runs
And on success it displays the generated image with meaningful alt text naming the garment and selected color
And the result is shown once, in that page session only.

### Scenario 2: The selected size/color variant drives the garment context

Given the product has non-discontinued variants including a selected size and color
When the shopper triggers try-on
Then the browser sends `productSlug`, `size` and `color` with the photo
And the server resolves that exact published-product / non-discontinued-variant combination from the catalog
And the provider prompt includes the product name, selected color, selected size and composition
And an unknown, draft/archived or discontinued combination is rejected without calling the provider.

### Scenario 3: Results come from the real provider behind `TryOnProvider`

Given the real adapter is configured with `TRYON_BASE_URL`, `TRYON_MODEL` and a key
When `generateTryOn` is called
Then it sends an authenticated `multipart/form-data` `POST {TRYON_BASE_URL without trailing slashes}/images/edits` (with the `.env` value this is exactly `https://inference.devexpert.io/v1/images/edits`; no second `/v1` is appended)
And the form contains `model`, `prompt` and the `image` file (the photo's bytes, MIME type and filename)
And it parses either `data[0].b64_json` or `data[0].url` from the OpenAI-shaped response into a `TryOnResult`
And any non-2xx, malformed body or transport failure surfaces as a typed `TryOnProviderError` that does not contain image bytes or base64.

### Scenario 4: Swapping the provider needs no UI or route change

Given the route and panel depend only on the `TryOnProvider` port
When the configured provider is replaced by the simulated adapter
Then the route still returns the same response shape and the panel still renders the result
And no panel or route source change is required.

### Scenario 5: Photo and result are never persisted or logged

Given the shopper uploads a photo and receives a result
When the request completes
Then no database row, file, object-storage object or temp file was created
And the photo bytes, base64 and result image are absent from logs and error messages
And the route returns the result with `Cache-Control: no-store`
And a provider-returned URL is handed to the browser without any server-side download or storage
And the client keeps only the current result in component state (no localStorage/IndexedDB), discarding it on unmount or regeneration.

### Scenario 6: Acknowledgement is required before generation

Given the photo notice is not accepted
When the shopper selects a photo
Then the try-on action stays disabled
And a request missing `consent=accepted` is rejected by the route with HTTP 400 before any provider call.

### Scenario 7: Failures surface without absorbing the failure feature

Given the provider is not configured or returns an error
When the shopper triggers try-on
Then the route returns a typed status (503 for missing configuration, 502 for provider failure)
And the panel shows a single generic error line and remains usable (file and variant selection still work)
And no retry-specific UX, invalid-photo validation, size checks or timeout policy is added here (owned by `virtual-tryon-failure`).

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json` — operating rules, current state and the selected feature metadata.
- `CONTEXT.md`, `CONSTRAINTS.md`, `docs/domain-model.md`, `docs/risks-and-open-questions.md` — try-on vocabulary, `TryOnSession` lifecycle, photo-privacy edge cases and blocking questions #2/#3.
- `docs/specs/product-detail-page.md`, `app/products/[slug]/page.tsx`, `app/products/[slug]/product-gallery.tsx` — the page this feature extends, its async `params`, `force-dynamic`, `notFound()` and client-component conventions.
- `app/api/chat/route.ts`, `lib/chat/{chat-assistant,openai-chat-assistant,index}.ts` — the established port + adapter + env-factory + typed-error + route pattern.
- `db/catalog.ts`, `db/schema/catalog.ts`, `db/seed-data.ts` — `getPublishedProductBySlug`, `listVariantsByProductId`, `Variant` (`size`, `color`, `colorHex`, `stockQty`, `discontinued`); seeded products have variants.
- `ARCHITECTURE.md`, `DESIGN.md`, `.env` (variable names only, values redacted) — AI provider configuration, AI visual language and try-on design open questions. `.env` contains `PORT`, `DATABASE_URL`, `TRYON_BASE_URL` (already including `/v1`) and `TRYON_MODEL`; the DevExpert key is available as the exported `DEVEXPERT_API_KEY` environment variable, not as a `.env` line. `.env.example` does not document try-on yet.
- Next.js 16 docs (read from the read-only base checkout because this worktree has no `node_modules`): `route.md` (`request.formData()`), `backend-for-frontend.md` (consume payloads), `serverActions.md` (1 MB action limit, not used here) and `proxyClientMaxBodySize.md` (proxy-only buffer limit).
- `vitest.config.mts` / existing tests — `ui` (jsdom) and `db` (embedded PostgreSQL) projects; no browser E2E harness.

### Existing Patterns To Follow

- External AI capability sits behind a repo-owned port; adapters accept an injectable `fetch`; factories read env lazily at request time so `pnpm build` works without keys.
- Route handlers use `export const dynamic = "force-dynamic"`, return `Response.json`, and map typed errors to 400/502/503.
- Data access goes through `db/catalog.ts`; pages never query tables directly. Published-only and non-discontinued filters are repository concerns.
- Client components use `"use client"`, labelled native controls, `data-testid` hooks and plain CSS classes; zero border radius, hairline borders, serif headings.
- Automated tests never call a live provider (`CONSTRAINTS.md` rule 5).

### Current Gaps

- No `TryOnProvider` port, adapter, simulated adapter, env factory or prompt builder exists.
- No `POST /api/try-on` route exists.
- No repository query resolves a published product + exact non-discontinued variant as try-on context.
- The product detail page has no try-on UI and no size/color picker.
- No DB table or storage exists for try-on sessions/photos — intentionally, and none will be added in this slice.

## Technical Approach

### 1. Port and errors — `lib/try-on/try-on-provider.ts` (create)

Framework-agnostic (no `next`, `react`, `db` or network imports):

```ts
export interface TryOnPhoto { bytes: Uint8Array; mimeType: string; filename: string }
export interface TryOnRequest { photo: TryOnPhoto; prompt: string }
export type TryOnImage =
  | { kind: "base64"; base64: string; mimeType: string }
  | { kind: "url"; url: string };
export interface TryOnResult { image: TryOnImage }
export interface TryOnProvider { generateTryOn(request: TryOnRequest): Promise<TryOnResult> }
```

Add `TryOnProviderError` with `kind: "configuration" | "provider"` and optional upstream `status`, mirroring `ChatAssistantError`. Error messages must never include request bytes, base64 or provider response bodies.

### 2. Prompt builder — `lib/try-on/prompt.ts` (create)

Pure `buildTryOnPrompt({ productName, color, size, composition }): string`. It must instruct the model to dress the person in the named garment and color at the stated size, preserve the person's identity/face/body proportions, keep a photorealistic studio result, and avoid text/watermarks. Client input never becomes a free-form prompt; the route builds it from catalog data.

### 3. Real adapter — `lib/try-on/openai-images-try-on-provider.ts` (create)

`createOpenAiImagesTryOnProvider({ apiKey, baseUrl, model, fetch? }): TryOnProvider`.

- `POST {baseUrl without trailing slashes}/images/edits` (`TRYON_BASE_URL` is the API base **including** `/v1`, exactly like `OPENAI_BASE_URL`; with the `.env` value the endpoint is `https://inference.devexpert.io/v1/images/edits`). Trailing slashes on the base URL are tolerated and must not produce `//` or a duplicate `/v1`.
- `Authorization: Bearer <key>`; do **not** set `content-type` manually (fetch supplies the multipart boundary).
- `FormData`: `model`, `prompt`, `image` (Blob from `photo.bytes` with `photo.mimeType`, filename `photo.filename`), `n = "1"`.
- Parse `data[0].b64_json` first into `{ kind: "base64", base64, mimeType }`, inferring `mimeType` from the decoded header (PNG/JPEG/WebP) because the gateway can return JPEG even for a PNG upload; otherwise `data[0].url` into `{ kind: "url", url }`; otherwise throw `TryOnProviderError`.
- Do not fetch a returned URL, do not write it anywhere, and do not log it. `fetch` is injectable for tests.
- Provider id constant `"devexpert-images"` may be exported for diagnostics; it is not sent to the browser.

### 4. Simulated adapter — `lib/try-on/simulated-try-on-provider.ts` (create)

`createSimulatedTryOnProvider(options?)` returns a deterministic small PNG as `{ kind: "base64" }` by default and can throw a typed provider error on demand for tests. In-process, no network, no env. Used by route/UI tests and available for local demos; it is not the production default.

### 5. Factory — `lib/try-on/index.ts` (create)

Lazy, cached `getTryOnProvider()` plus `resetTryOnProvider()` for tests:

| Variable | Required | Purpose |
| --- | --- | --- |
| `TRYON_BASE_URL` | to generate | API base including `/v1`; endpoint appends `/images/edits`. |
| `TRYON_MODEL` | to generate | Image-edit model, e.g. `image-edit`. |
| `TRYON_API_KEY` | no | Falls back to the exported `DEVEXPERT_API_KEY` environment variable, then `OPENAI_API_KEY`. |

Missing key/base/model throws `TryOnProviderError(kind: "configuration")` (route → 503). Env is read at call time so `pnpm build` succeeds with none set. Never expose these via `NEXT_PUBLIC_*`.

### 6. Data access — `db/catalog.ts` (modify)

Add `TryOnGarmentContext` (`productId`, `slug`, `name`, `composition`, `size`, `color`, `colorHex`) and `getTryOnGarmentContext(db, slug, size, color)`. It joins `product` → `variant` and requires `product.status = 'published'`, exact `variant.size`/`variant.color`, and `variant.discontinued = false`; returns `undefined` otherwise. Parameterized Drizzle query only. Reuse `listVariantsByProductId` in the page to build the picker options (`!discontinued`; include `stockQty`/`colorHex`); if that second read fails, still render the page with an empty variant list so try-on shows its unavailable state. No migration.

### 7. Route — `app/api/try-on/route.ts` (create)

`export const dynamic = "force-dynamic"`. `POST(request: Request)`:

1. `await request.formData()` (Next 16 standard Web API; route handlers are not subject to the 1 MB server-action limit).
2. Read `photo` (must be a non-empty `File`), `productSlug`, `size`, `color`, `consent`. Missing/malformed fields or `consent !== "accepted"` → 400. Do not add MIME/size/dimension validation here (failure feature).
3. Resolve `getTryOnGarmentContext`; no match → 400 generic "This garment is not available for try-on." (never reveal draft/archived).
4. Build the prompt and call `getTryOnProvider().generateTryOn({ photo, prompt })`.
5. Return `Response.json({ image })` with `Cache-Control: no-store`. Map `TryOnProviderError` configuration → 503, provider → 502; unknown → 502 generic. Log only a fixed message plus error name/status — never the photo, bytes, base64, prompt payload or provider body.

The route never imports `fs`, never writes uploads to disk, never touches the DB beyond the read above, and never downloads a URL result.

### 8. UI — `app/products/[slug]/try-on-panel.tsx` (create, `"use client"`)

Props: `productSlug`, `productName`, `variants` (`size`, `color`, `colorHex`, `stockQty`; non-discontinued). Render in the commentary column after the specs:

- Labelled Size and Color selects populated from the variants (colors filtered by selected size; out-of-stock combinations remain selectable for try-on and are clearly marked "Out of stock"). This is try-on garment context only, not the purchase variant.
- Labelled file input (`accept="image/*"`), a required acknowledgement checkbox, and an AI-styled "Try on" button (disabled until a file is chosen, consent is checked, and no request is running).
- States: idle, generating (text loading state), ready (single `<img>` with `src` from the result and meaningful alt text, e.g. "Virtual try-on of you wearing the Longline Wool Overcoat in Navy"), minimal generic error line.
- Submit `FormData` to `POST /api/try-on` with `photo`, `productSlug`, `size`, `color`, `consent=accepted`. Keep the result in component state only; replace it on a new generation and discard it on unmount. No localStorage/IndexedDB, no download link, no history.
- If the product has no non-discontinued variants, show a short unavailable message instead of the controls.

### 9. Styles and configuration

Add a `.try-on*` block to `app/globals.css` using existing tokens: zero radius, hairline border, translucent steel AI tint, calm spacing, visible focus ring, responsive stack. Add the try-on variables (commented, no secrets) to `.env.example`.

## Privacy And Security Stance

- **Interim in-memory only** until blocking question #3 is decided: no persistence anywhere (DB, object storage, disk, temp files, cache, localStorage/IndexedDB). The result exists only for the current request/component.
- Never log image bytes, base64, data URLs, provider URLs or full provider response bodies; errors are generic/typed. The route response sets `Cache-Control: no-store`, and no analytics, telemetry, cookies or session identifiers are added.
- Provider-returned URLs are passed to the browser as-is; the server performs no download or persistence, and `b64_json` is preferred.
- The API key is server-side only and read lazily. The prompt is built from catalog data, so client input cannot inject prompt text.
- The acknowledgement checkbox is a minimal interim gate, **not** final legal consent; its copy and presence must be reviewed when #3 is resolved. Only published products and non-discontinued variants are allowed, and errors never disclose draft/archived data.

## Expected File Changes

- `lib/try-on/try-on-provider.ts` — create; port types and typed error.
- `lib/try-on/prompt.ts` — create; pure prompt builder.
- `lib/try-on/openai-images-try-on-provider.ts` — create; real DevExpert/OpenAI-images adapter.
- `lib/try-on/simulated-try-on-provider.ts` — create; deterministic fake adapter.
- `lib/try-on/index.ts` — create; env-driven lazy factory.
- `lib/try-on/openai-images-try-on-provider.test.ts`, `prompt.test.ts`, `simulated-try-on-provider.test.ts` — create.
- `app/api/try-on/route.ts` + `route.test.ts` — create; server seam and tests.
- `app/products/[slug]/try-on-panel.tsx` + `try-on-panel.test.tsx` — create; client UI and tests.
- `app/products/[slug]/page.tsx` — modify; load variants and mount the panel.
- `app/globals.css` — modify; `.try-on*` styles.
- `db/catalog.ts` — modify; `TryOnGarmentContext` + `getTryOnGarmentContext`.
- `db/tests/try-on-context.test.ts` — create; published/non-discontinued resolution and rejection cases.
- `.env.example` — modify; document `TRYON_BASE_URL` as the API base including `/v1`, `TRYON_MODEL`, and the optional `TRYON_API_KEY` / exported `DEVEXPERT_API_KEY` fallback.
- `ARCHITECTURE.md`, `CONSTRAINTS.md` — modify; see below.
- `docs/risks-and-open-questions.md` — already updated by the planner (provider #2 resolved for this work; #3 explicitly still open).
- `feature_list.json`, `PROGRESS.md` — modify at implementation end only (not by the planner).

No DB migration, no new dependency, no object storage.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md` + `stitch_image_based_application/detalle_de_producto_probador_virtual_ia/` (proposal only).
- Screens or states affected: product detail commentary column — idle, generating, ready, minimal error, no-variant fallback.
- New design artifact required: no. The reference and `DESIGN.md` cover the calm AI surface; `DESIGN.md`'s open question about single output vs gallery/slider is resolved **provisionally for this slice as a single output**.
- Constraints: Newsreader serif heading, Hanken Grotesk body, warm ivory palette, hairline borders, **zero border radius** (only AI pips/swatches may round), steel AI tint, visible focus, English copy. Result `<img>` needs meaningful alt text. Do not add FITIQ, cross-sell, add-to-cart, price/stock changes, multi-result gallery or a comparison slider.

## Durable Documentation Impact

- `ARCHITECTURE.md`: **update** — add `POST /api/try-on` to the runtime surface (private/no-store, dynamic), add `lib/try-on/` and the try-on panel to Repository Layout, mark `TryOnProvider` realised in Layering Intent, and extend the AI provider configuration table with `TRYON_*`.
- `CONSTRAINTS.md`: **update** — add a durable privacy rule: try-on photos/results MUST NOT be persisted, cached or logged (no DB, object storage, disk/temp files, localStorage; in-memory per request only) until the consent/retention decision (#3) is made.
- `AGENTS.md`: **not needed** — startup path, commands and workflow are unchanged.
- Other docs: `docs/risks-and-open-questions.md` updated by the planner (#2 resolved for this work, #3 still open). `docs/technical-discovery.md` not needed; its provider open point is covered by the risks doc.

## Implementation Plan

1. Add the port, prompt builder, simulated adapter and real adapter with injectable `fetch`; prove the request/response contract offline (injected fetch + loopback HTTP).
2. Add the env factory and `getTryOnGarmentContext` repository function with DB tests.
3. Add `POST /api/try-on` with structural validation, consent gate, prompt building, typed error mapping and `no-store`.
4. Add the try-on panel, mount it on the product detail page with non-discontinued variant options, and add the styles.
5. Add route and UI tests, run the full gate (`./init.sh`, `pnpm build`), perform the manual live-provider check, then update durable docs and evidence.

## Implementation Tasks

- [x] Create `lib/try-on/try-on-provider.ts` (request/result types, `TryOnProvider`, `TryOnProviderError`).
- [x] Create `lib/try-on/prompt.ts` with `buildTryOnPrompt` and a unit test asserting product/color/size/composition inclusion.
- [x] Create `lib/try-on/simulated-try-on-provider.ts` (deterministic base64 result; throw-on-demand for tests).
- [x] Create `lib/try-on/openai-images-try-on-provider.ts` (multipart POST, bearer, b64/url parsing, typed errors).
- [x] Write adapter contract tests with injected `fetch` (exact endpoint assertion `https://inference.devexpert.io/v1/images/edits` when the base is the `.env` value, auth, model, prompt, image part, b64 and url parsing, non-2xx/malformed/transport errors, no bytes in messages).
- [x] Add an in-process `node:http` integration test driving the real adapter over real HTTP (no live network).
- [x] Create `lib/try-on/index.ts` with lazy env factory, key fallback and `resetTryOnProvider`.
- [x] Add `TryOnGarmentContext` + `getTryOnGarmentContext` to `db/catalog.ts` and `db/tests/try-on-context.test.ts`.
- [x] Create `app/api/try-on/route.ts` (formData, consent, context lookup, prompt, provider call, 400/502/503, `Cache-Control: no-store`).
- [x] Write `app/api/try-on/route.test.ts` (happy path, missing consent, unknown variant, configuration 503, provider 502, no-store, response shape).
- [x] Create `app/products/[slug]/try-on-panel.tsx` (variant-correct picker, file input, consent, loading, result, minimal error, no persistence).
- [x] Mount the panel in `app/products/[slug]/page.tsx` using `listVariantsByProductId` filtered to non-discontinued variants.
- [x] Write `app/products/[slug]/try-on-panel.test.tsx` (consent gate, selected variant forwarded, result displayed, minimal error, simulated-provider swap unchanged).
- [x] Add `.try-on*` styles to `app/globals.css` (zero radius, hairline, AI tint, focus, responsive).
- [x] Document `TRYON_BASE_URL` (API base including `/v1`), `TRYON_MODEL` and the optional `TRYON_API_KEY` / exported `DEVEXPERT_API_KEY` fallback in `.env.example` without secrets.
- [x] Update `ARCHITECTURE.md` and `CONSTRAINTS.md` per Durable Documentation Impact.
- [x] Run `./init.sh`, `pnpm build` and the manual live-provider check; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — executes the standard non-blocking gate (install + lint + typecheck + test) and exits 0 with **all `TRYON_*` variables unset**; it must not start `pnpm dev`.
- `pnpm test` — new `ui` tests: adapter contract (including the exact endpoint `https://inference.devexpert.io/v1/images/edits` for the `.env` base) + loopback HTTP, prompt, simulated adapter, route (7 cases) and panel; new `db` test resolves published/non-discontinued variants and rejects draft, archived, unknown and discontinued cases.
- `pnpm lint` / `pnpm typecheck` — zero errors.
- `pnpm build` — exits 0 with no `TRYON_*` variables; `/api/try-on` appears as a dynamic route and `/products/[slug]` remains dynamic.
- Privacy checks: `grep` the try-on source for `fs`, `writeFile`, `localStorage`, `console.log`/`console.error` of `base64`/photo; confirm no migration/table/storage added and `git status` shows no uploaded image or result artifact.
- Manual live provider (opt-in; feasible because `DEVEXPERT_API_KEY` is exported in the machine's shell): configure `TRYON_BASE_URL`, `TRYON_MODEL` and let the key fall back to `DEVEXPERT_API_KEY`, run `pnpm dev`, submit a real photo from outside the repo through the UI (or a `curl -F` multipart call) and confirm HTTP 200 plus a rendered result. Do **not** commit the key, save the photo or save the result in the repo; stop the server afterwards. Record only non-sensitive metadata (status, rendered yes/no, selected product/variant).
- E2E: no persistent browser E2E harness exists (`ARCHITECTURE.md`). Focused route/UI/db tests are the established substitute; state this in the evidence.

## Evidence To Capture

- `./init.sh` exit 0 with test counts and the new test names; `pnpm lint`/`pnpm typecheck`/`pnpm build` exit 0 with `TRYON_*` unset.
- Adapter test asserting the exact endpoint `https://inference.devexpert.io/v1/images/edits` for the `.env` base (no duplicate `/v1`), bearer header, `model`, `prompt` and `image` part, plus both `b64_json` and `url` parsing.
- DB test names for published/non-discontinued resolution and rejection.
- Manual live-provider result (status, rendered yes/no, product/variant) without storing the photo or result.
- Privacy checks: no DB/storage/temp files, no image bytes in logs, `Cache-Control: no-store`.
- Updated `feature_list.json` verification/evidence and `PROGRESS.md` session log.

## Open Questions

1. **Photo consent and retention (blocking #3) — unresolved.** Interim stance: process in memory only, never persist/cache/log, result session-only, no history. Before public launch decide legal basis, consent copy (and whether a checkbox is sufficient), retention/deletion window, minors policy, provider-side retention/training and a DPA with DevExpert. The current acknowledgement copy is provisional and must be reviewed.
2. **Provider-side photo handling.** DevExpert's retention/training terms and data location are not verified; treat the provider call as sensitive data processing. Resolve with the provider before launch even though the app stores nothing.
3. **URL results.** `b64_json` is preferred. If the gateway returns only a URL, this slice hands it to the browser unchanged (no server persistence). Whether that URL is public, short-lived or cacheable must be reviewed under #3.
4. **Upload size and timeouts.** The platform request-body limit (e.g. Vercel's ~4.5 MB) and provider latency/limits are not enforced here. `virtual-tryon-failure` owns invalid/oversized-photo rejection, timeout policy and retry UX.
5. **Result presentation.** A single output is chosen provisionally; gallery/comparison-slider presentation remains a `DESIGN.md` open question for later.

## Validator Checklist

- [x] Implementation stays within scope: no variant-selection price/stock behavior, cart, persistence, history, admin, chat, fit predictor or cross-sell.
- [x] Acceptance scenarios 1–7 pass.
- [x] The try-on-local variant picker only supplies garment context and does not alter the page price, stock message or purchase behavior.
- [x] `TryOnProvider` is framework-agnostic; the real adapter and simulated adapter are swappable without panel/route changes.
- [x] The adapter posts exactly `{TRYON_BASE_URL without trailing slashes}/images/edits` (the `.env` value yields `https://inference.devexpert.io/v1/images/edits`) and never appends a second `/v1`.
- [x] The route resolves a published product + non-discontinued variant and rejects other combinations without a provider call.
- [x] Photo/result are never persisted, cached or logged; no `fs`/temp files/DB columns/object storage/localStorage; response is `no-store`.
- [x] No provider URL is fetched server-side; base64 is preferred.
- [x] Typed errors map to 400/502/503 and the panel shows only a minimal generic error (failure UX not absorbed).
- [x] `./init.sh` and `pnpm build` pass with all `TRYON_*` variables unset; no live provider call in the automated gate.
- [x] `ARCHITECTURE.md` and `CONSTRAINTS.md` updated; `docs/risks-and-open-questions.md` reflects #2 resolved and #3 still open.
- [x] Evidence is present in `feature_list.json` and `PROGRESS.md`; no unrelated behavior was added.
