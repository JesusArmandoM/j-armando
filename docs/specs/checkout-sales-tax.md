# Feature Implementation Spec: Sales tax is calculated from the shipping address

## Source Feature

- `id`: `checkout-sales-tax`
- `area`: `checkout`
- `depends_on`: `["checkout-shipping-method"]` (accepted)
- `status`: `not_started` at planning time
- `source`: `feature_list.json`

## Goal

Provide destination-based US sales tax calculation at `/checkout` where the sales tax line in the Order Summary is calculated from the shipping address's destination state code (Step 1).
Catalog, product, and cart prices remain strictly tax-exclusive (as specified in `CONTEXT.md` → Sales Tax and `CONSTRAINTS.md`).
The Order Summary displays Estimated Tax as its own line item and the Order Total strictly equals `subtotal + shipping + sales tax` in integer cents.
Changing the destination state in Step 1 immediately recalculates sales tax and updates the Order Summary.

## Non-Goals

- Collecting contact email or shipping address (completed in `checkout-contact-and-address`).
- Selecting shipping method (completed in `checkout-shipping-method`).
- Executing payment transactions and creating paid orders (owned by `order-creation-on-payment`).
- Real-time third-party tax APIs (Avalara, TaxJar) or local county/city jurisdiction boundary lookups — state-level baseline rates with fallback are modeled per discovery agreements.
- International VAT/GST tax calculation (US market only).

## Job Story

When I have entered or modified my delivery address at checkout,
I want to see the destination state sales tax clearly calculated and displayed as a separate line in the order summary,
so that I know the exact tax amount applied to my order and the accurate total before proceeding to payment.

## Users And Permissions

- **Guest Shopper:** enters their contact email and shipping address in Step 1. When an address is saved, sales tax is automatically calculated based on the destination state code.
- **Session Isolation:** the active checkout session is bound to the httpOnly `ja_cart_session` cookie; tax calculation uses only the state from the authenticated shopper's session.

## Acceptance Scenarios

### Scenario 1: Missing address displays tax hint
Given a guest shopper on `/checkout` with a non-empty cart where shipping address has not been saved yet
When the Order Summary renders
Then the Sales Tax line displays "Estimated Tax" with hint text "Calculated from address" (`data-testid="summary-tax-hint"`)
And the Total equals subtotal (plus shipping if selected, or subtotal alone).

### Scenario 2: Destination state calculates sales tax in integer cents
Given a guest shopper on `/checkout` with items in their cart (e.g. subtotal $249.00 / 24900 cents)
When the shopper saves a New York (NY) shipping address (8.0% tax rate)
Then the Order Summary renders an "Estimated Tax" line displaying "$19.92" (`data-testid="summary-tax"`)
And the tax amount is calculated as `Math.round(24900 * 0.08) = 1992` integer cents.

### Scenario 3: Order Summary total equals subtotal + shipping + sales tax
Given a guest cart with subtotal $249.00 and saved NY address (tax $19.92)
When no shipping method is selected yet
Then the total equals $268.92 ($249.00 + $0.00 + $19.92)
When Standard Shipping ($0.00) is selected
Then the total equals $268.92 ($249.00 + $0.00 + $19.92)
When Express Shipping ($15.00) is selected
Then the total equals $283.92 ($249.00 + $15.00 + $19.92).

### Scenario 4: Changing destination state changes calculated sales tax
Given a guest shopper who previously saved an address with state NY (tax $19.92)
When the shopper clicks "Modify" in Step 1, changes state to California (CA, 7.25% tax rate), and saves
Then the Estimated Tax line updates to "$18.05" (`Math.round(24900 * 0.0725) = 1805` cents)
And the Order Summary total updates accordingly.

### Scenario 5: Tax-exempt US states produce $0.00 tax
Given a guest shopper on `/checkout` with subtotal $249.00
When the shopper specifies an address in a state with no sales tax (Alaska `AK`, Delaware `DE`, Montana `MT`, New Hampshire `NH`, or Oregon `OR`)
Then the Estimated Tax line renders "$0.00" (`data-testid="summary-tax"`)
And the total equals subtotal + shipping cost + $0.00.

### Scenario 6: Catalog, product, and cart prices remain tax-exclusive
Given published products in `/catalog`, product details at `/products/[slug]`, and `/cart`
Then displayed prices are explicitly tax-exclusive with notices stating sales tax is calculated at checkout
And no tax is bundled into unit or line prices.

### Scenario 7: Sales tax calculation module edge cases
Given the pure sales tax module `lib/tax/sales-tax.ts`
When invoked with empty, null, or whitespace state codes, it returns `{ rate: 0, taxCents: 0 }`
When invoked with case-insensitive codes (e.g. `"ny"`, `" ca "`), it normalizes correctly
When invoked with unlisted state codes, it falls back to a 5.0% (0.05) rate
When invoked with zero or negative subtotal, it returns `taxCents: 0`
And all returned `taxCents` values are verified integers.

## Technical Plan

1. **Pure Sales Tax Module (`lib/tax/sales-tax.ts`):**
   - Framework-agnostic pure calculation module.
   - Comprehensive state tax rate dictionary `STATE_TAX_RATES` covering US states + DC.
   - 0.00 rate for exempt states (AK, DE, MT, NH, OR).
   - `DEFAULT_TAX_RATE = 0.05` for unlisted states.
   - Function `calculateSalesTax(subtotalCents: number, stateCode?: string | null): SalesTaxCalculation`.
   - Unit tests in `lib/tax/sales-tax.test.ts`.

2. **Order Summary & Checkout UI (`app/checkout/page.tsx`):**
   - Read `checkoutSession?.state`.
   - Compute `taxCalculation = checkoutSession?.state ? calculateSalesTax(summary.subtotalCents, checkoutSession.state) : null`.
   - Compute `taxCents = taxCalculation ? taxCalculation.taxCents : 0`.
   - Compute `totalCents = summary.subtotalCents + (shippingCostCents ?? 0) + taxCents`.
   - Render Estimated Tax row with `summary-tax` or `summary-tax-hint`.
   - Include tax-exclusive helper notice.

3. **Verification:**
   - Unit tests in `lib/tax/sales-tax.test.ts`.
   - Integration tests in `app/checkout/page.test.tsx`.
   - Run standard gate `CI=true ./init.sh` and `pnpm build`.
   - Live HTTP validation on port 3006.
