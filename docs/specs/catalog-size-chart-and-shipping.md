# Catalog Size Chart and Shipping Policy

Status: implemented (self-verified 2026-10-19; independent validation not run)
Feature: `catalog-size-chart` (plus the shipping-cost decision recorded for `checkout-shipping-method`)
Owner: storefront catalog + chat

## Problem

Shoppers asking about fit could only be told which sizes, colors and stock existed; the assistant
explicitly said that body measurements were not published. Shipping cost was also an explicit
unknown, which left the assistant unable to answer a basic pre-purchase question and blocked the
checkout shipping feature.

The user asked to use a market-standard US shipping cost and to add size-chart measurements to the
current catalog (2026-10-19).

## Decisions

### Shipping

| Method | Cost | Delivery estimate | Notes |
| --- | --- | --- | --- |
| Standard Shipping | Free | 3–5 business days | US orders; matches the storefront's existing "free standard shipping" copy |
| Express Shipping | $15.00 flat | 1–2 business days | US orders |

This resolves blocking open question #5. It is a store policy decision, not a scraped live rate.
The same values are stored in two places by design:

- `shipping_method` rows in `db/seed-data.ts` for the future checkout feature;
- the exact chat answer in `lib/chat/guardrails/store-knowledge.ts`.

Both are integer cents (`0` and `1500`) and must be edited together if the policy changes.

### Size chart

The catalog now has a category-level **body-measurement** chart. It is not a garment-measurement
chart and does not predict fit or recommend a size.

- Table: `size_chart` (`category_id`, `size`, `measurements` JSONB, unique category/size).
- Sizes: XS, S, M, L, XL.
- Values: approximate inches, standard US women's body measurements.
- The product page shows only the sizes the product actually offers (non-discontinued variants).
- The assistant uses only sizes offered by the matched product and never invents a missing value.

| Category | Measurements |
| --- | --- |
| Coats, Blazers, Knitwear, Shirts | Chest/bust, waist, hip, sleeve |
| Dresses | Chest/bust, waist, hip, length |
| Trousers | Waist, hip, inseam, rise |

| Size | Chest/bust | Waist | Hip | Sleeve | Dress length | Inseam | Rise |
| --- | --- | --- | --- | --- | --- | --- | --- |
| XS | 31–32 | 24–25 | 34–35 | 30–31 | 43–44 | 30–31 | 9–10 |
| S | 33–34 | 26–27 | 36–37 | 31–32 | 44–45 | 30–31 | 10–11 |
| M | 35–36 | 28–29 | 38–39 | 32–33 | 45–46 | 31–32 | 10–11 |
| L | 37–39 | 30–32 | 40–42 | 33–34 | 46–47 | 31–32 | 11–12 |
| XL | 40–42 | 33–35 | 43–45 | 34–35 | 47–48 | 32–33 | 11–12 |

Sleeve is a body measurement, not a finished sleeve length. Dress length is measured from the
shoulder. Trousers use the same waist/hip chart as tops; rise and inseam are approximate.

## User-visible behavior

- A published product page shows a **Size guide** table with approximate body measurements for the
  sizes the product offers. Sizes not sold for that product are omitted. A chart read failure does
  not break the product page; the guide is omitted.
- Chat sizing questions return available sizes/colors/stock and the published body measurements,
  followed by the disclaimer that measurements are approximate and the shopper should contact the
  store if between sizes.
- A sizing question that does not identify a product asks which garment the shopper means.
- A matched product with no published chart still says measurements are not published.
- Shipping questions return the exact verified policy above; no LLM call is made.

## Acceptance scenarios

1. Migration creates `size_chart` with a unique category/size constraint and category FK.
2. Seed inserts 30 chart rows (6 categories × 5 sizes) and 2 shipping methods; re-running the seed
   does not duplicate them or overwrite edits; `db:verify` checks their minimum counts.
3. The product page renders the chart for offered sizes only and does not render XS/XL when the
   product does not sell them.
4. The product page still renders when the chart read fails.
5. Chat sizing includes the published measurements; no-product and no-chart fallbacks remain honest.
6. Shipping cost returns the exact verified answer with no LLM call.
7. `./init.sh`, lint and typecheck are green.

## Verification

Run:

```bash
./init.sh
pnpm db:migrate
pnpm db:seed
pnpm db:verify
```

Recorded on 2026-10-19:

- `pnpm test` → 35 test files / 265 tests passed (was 35 / 261).
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.
- Local database: `size charts: 30`, `shipping methods: 2`; `db:verify` → OK.

Focused test names:

- `db/tests/migrate.test.ts` → `scenario 1: runs against an empty database and creates the core tables`
- `db/tests/seed.test.ts` → `scenario 4: populates categories, products and variants` and `scenario 5: re-running the seed neither duplicates rows nor overwrites edits`
- `db/tests/product-detail.test.ts` → `returns the category size chart in XS–XL order`
- `app/products/[slug]/page.test.tsx` → `renders the published size guide for the sizes this product offers` and `omits the size guide when the chart read fails without breaking the page`
- `lib/chat/guardrails/answer.test.ts` → `answers sizing from published variants and body measurements`, `never invents measurements when a matched product has no chart`, `asks which garment when a sizing question has no product`
- `lib/chat/guarded-chat-assistant.test.ts` → `scenario 1: answers shipping cost with the exact verified fact and never calls the LLM`, `answers a generic coat sizing question from published variants without the LLM`, `asks which garment when no product matches a sizing question`

## Out of scope

- Fit prediction, size recommendation, or "runs true to size" claims.
- Per-garment finished measurements (chest width, shoulder, sleeve length, garment length).
- Admin editing of size charts; the data is seeded catalog content for now.
- Returns/refunds policy and the checkout UI that will consume the seeded shipping methods.
- Making measurements up for products/categories with no published chart.

## Durable documentation impact

- `ARCHITECTURE.md` — data layer table/seed counts and chat grounding.
- `CONSTRAINTS.md` rule 7 — published measurements are allowed; missing measurements must be stated.
- `docs/risks-and-open-questions.md` — #5 resolved; size-chart content question resolved.
- `feature_list.json` — new `catalog-size-chart` feature, `checkout-shipping-method` notes updated.
- `PROGRESS.md` — Session 023.
