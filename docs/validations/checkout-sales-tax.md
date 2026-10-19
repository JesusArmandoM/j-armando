# Validation Record: checkout-sales-tax

## Feature Information

- **Feature ID:** `checkout-sales-tax`
- **Spec:** `docs/specs/checkout-sales-tax.md`
- **Date:** 2026-10-19
- **Verdict:** **ACCEPT**
- **Validator Role:** Independent feature-validator

---

## Acceptance Scenarios Verification

### Scenario 1: Missing address displays tax hint
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/page.test.tsx` ("renders order summary and checkout flow when cart has items without chosen shipping") and live HTTP test on port 3006. When no checkout session address is saved, the Order Summary renders `<span>Estimated Tax</span>` and `<span class="checkout-order-summary__hint" data-testid="summary-tax-hint">Calculated from address</span>`. Total equals subtotal ($249.00).

### Scenario 2: Destination state calculates sales tax in integer cents
- **Result:** PASS
- **Evidence:** Verified in `lib/tax/sales-tax.test.ts` ("calculates sales tax correctly for major US states with integer rounding") and `app/checkout/page.test.tsx` ("renders Order Summary with standard shipping ($0.00), NY sales tax ($19.92), and total ($268.92)"). For a $249.00 subtotal (24900 cents) in NY (8.0% tax), calculated sales tax is exactly 1992 cents ($19.92).

### Scenario 3: Order Summary total equals subtotal + shipping + sales tax
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/page.test.tsx`:
  - With standard shipping ($0.00) and NY tax ($19.92): Subtotal $249.00 + Shipping $0.00 + Estimated Tax $19.92 = Total $268.92 (`summary-total`).
  - With express shipping ($15.00) and NY tax ($19.92): Subtotal $249.00 + Shipping $15.00 + Estimated Tax $19.92 = Total $283.92 (`summary-total`).
  - Live HTTP verification on port 3006 confirmed the identical values in rendered HTML.

### Scenario 4: Changing destination state changes calculated sales tax
- **Result:** PASS
- **Evidence:** Verified in `app/checkout/page.test.tsx` ("recalculates sales tax when shipping destination state changes (CA 7.25%)") and live HTTP transcript on port 3006:
  - Initial NY address (8.0%): Estimated Tax $19.92, Total with Express $283.92.
  - Updated to CA address (7.25%): Estimated Tax $18.05 (`Math.round(24900 * 0.0725) = 1805` cents), Total with Express $282.05 ($249.00 + $15.00 + $18.05).
  - Updating via `POST /api/checkout/contact-and-address` immediately revalidates `/checkout` and updates the Order Summary.

### Scenario 5: Tax-exempt US states produce $0.00 tax
- **Result:** PASS
- **Evidence:** Verified in `lib/tax/sales-tax.test.ts` ("returns 0 tax for states with no sales tax (OR, NH, MT, DE, AK)"), `app/checkout/page.test.tsx` ("calculates $0.00 sales tax for tax-exempt states like Oregon (OR)"), and live HTTP verification on port 3006. With an Oregon (OR) address: Estimated Tax displays "$0.00" (`summary-tax`), and Total equals Subtotal ($249.00) + Express Shipping ($15.00) = $264.00; with Standard Shipping ($0.00), Total equals $249.00.

### Scenario 6: Catalog, product, and cart prices remain tax-exclusive
- **Result:** PASS
- **Evidence:** Verified across catalog, product detail, cart, and checkout:
  - `app/catalog/page.tsx`: "Prices in USD (tax-exclusive). Sales tax calculated at checkout."
  - `app/products/[slug]/page.test.tsx` & `app/products/[slug]/variant-selector.tsx`: "USD, tax-exclusive. Sales tax calculated at checkout."
  - `app/cart/page.test.tsx` & `app/cart/page.tsx`: "USD, tax-exclusive. Taxes and shipping calculated at checkout."
  - `app/checkout/page.tsx`: "Prices in USD (tax-exclusive). Sales tax is calculated from your shipping address."
  - No sales tax is bundled into unit prices or subtotal calculations.

### Scenario 7: Sales tax calculation module edge cases
- **Result:** PASS
- **Evidence:** Verified in `lib/tax/sales-tax.test.ts` (7 tests passed):
  - Null, undefined, empty string, and whitespace state codes return `{ rate: 0, taxCents: 0 }`.
  - Case-insensitivity ("ny", " ca ") and whitespace trimming handled seamlessly.
  - Unlisted/unknown state codes receive the fallback rate of 5.0% (0.05).
  - Zero and negative subtotals return `taxCents: 0`.
  - All calculated `taxCents` values are verified integers.

---

## Verification Suite Results

- `CI=true ./init.sh`: **54 test files / 443 tests passed** (0 failures).
- `pnpm lint`: exit 0 (0 errors, 0 warnings).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm build`: exit 0 (compiled dynamic routes `ƒ /cart`, `ƒ /checkout`, `ƒ /api/cart/lines`, `ƒ /api/checkout/contact-and-address`, `ƒ /api/checkout/shipping-method`).
- Focused sales tax and checkout test suites (10 files / 76 tests passed):
  - `lib/tax/sales-tax.test.ts`: 7/7 passed
  - `app/checkout/page.test.tsx`: 9/9 passed
  - `app/checkout/shipping-method-form.test.tsx`: 5/5 passed
  - `app/checkout/contact-and-address-form.test.tsx`: 8/8 passed
  - `app/checkout/checkout-input.test.ts`: 9/9 passed
  - `app/checkout/payment-outcome.test.tsx`: 4/4 passed
  - `app/api/checkout/shipping-method/route.test.ts`: 12/12 passed
  - `app/api/checkout/contact-and-address/route.test.ts`: 9/9 passed
  - `db/tests/checkout-shipping-method.test.ts`: 8/8 passed
  - `db/tests/checkout-contact-and-address.test.ts`: 5/5 passed
- Live HTTP verification on port 3006:
  - Empty cart `/checkout` → renders empty state ("Your Cart is Empty").
  - Adding Double-Breasted Linen Blazer ($249.00) → sets `ja_cart_session`.
  - `/checkout` prior to saving address → Subtotal: "$249.00", Shipping: "Calculated next step", Estimated Tax: "Calculated from address", Total: "$249.00".
  - `POST /api/checkout/contact-and-address` with NY address → Estimated Tax: "$19.92", Total: "$268.92".
  - `POST /api/checkout/shipping-method` with Express ($15.00) → Shipping: "$15.00", Estimated Tax: "$19.92", Total: "$283.92".
  - `POST /api/checkout/contact-and-address` updating to CA address → Shipping: "$15.00", Estimated Tax: "$18.05", Total: "$282.05".
  - `POST /api/checkout/contact-and-address` updating to OR address (0% tax) → Shipping: "$15.00", Estimated Tax: "$0.00", Total: "$264.00".
  - `POST /api/checkout/shipping-method` switching to Standard ($0.00) with OR address → Shipping: "$0.00", Estimated Tax: "$0.00", Total: "$249.00".

---

## Findings

None. All acceptance criteria met with high code quality, integer-cent money discipline, and comprehensive test coverage.

---

## Verdict

**ACCEPT** — The feature is complete, verified, secure, and ready for handoff to `order-creation-on-payment`.
