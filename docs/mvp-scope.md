# MVP Scope

Project: **J. Armando**. Parent document: `build-brief.md`.

## MVP Thesis

A shopper can go from landing page to a confirmed, paid order on a real clothing storefront **without registering in advance**, and can then come back and find that order — while the two AI capabilities that define the product (chat assistant and virtual try-on) are genuinely functional and running against real providers.

The MVP deliberately includes the hardest feature (virtual try-on) instead of postponing it, and deliberately excludes breadth that does not prove the thesis (stylist cross-sell, fit prediction, marketing, returns).

## Included

### Catalog
- Product listing with grid layout and responsive baseline.
- Filters: category, size, color, price limit.
- Sorting: newest, price ascending/descending, name.
- Result count and reset-filters affordance.
- Product cards: image, name, price, size/color availability hints.
- Product detail: image gallery, composition and care, size selector, color selector, add to cart.
- Per-variant stock awareness (out-of-stock sizes visibly disabled).

### Shopping
- Guest cart: add, change quantity, remove lines, persist across the session.
- Checkout as a guest: contact email, shipping address, shipping method (with cost), payment step.
- Simulated payment behind a `PaymentProvider` interface: success, failure and pending outcomes, with retry.
- Order confirmation screen.
- Order history for the account holder.

### Identity
- Account created or linked at payment confirmation, keyed by unique email.
- Optional password at creation (Quick Access).
- Sign-in and sign-out.
- Admin role with backoffice access.

### Backoffice (minimal)
- Create/edit/publish/archive products and variants.
- Set stock per variant.
- List orders and move them through fulfillment (`paid` → `preparing` → `shipped` → `delivered`).

### AI
- **Chat Assistant** on the storefront: real LLM behind a `ChatAssistant` interface; answers product, sizing, fabric, shipping and store-policy questions.
- **Virtual Try-On** on the product detail page: photo upload → generate → show result; real external service behind a `TryOnProvider` interface; failure and timeout handled.

### Cross-cutting
- English UI copy; English documentation.
- USD pricing with US sales tax added at checkout based on the shipping address. Catalog prices are tax-exclusive.
- Secrets via environment configuration; no secrets or personal data in logs.

## Excluded

- Real payment gateway, 3-D Secure, PCI scope.
- Email verification, password recovery, social login.
- Multi-country, multi-currency, multi-language storefronts.
- Native mobile app, public third-party API.
- **AI Stylist Cross-Sell** ("Coordinados por Stylist IA").
- **Fit Recommendation** engine ("FITIQ" / fit predictor).
- Newsletter subscription and marketing automation.
- Customer-facing order tracking portal / carrier integration.
- Returns, refunds and the 30-day satisfaction guarantee flow.
- Editorial collections/capsules as a merchandising system (basic category grouping is enough).
- Loyalty, gift cards, discount codes, wishlists.
- Inventory forecasting, analytics dashboards, observability beyond basic logging and error tracking.

## First Vertical Slice

The smallest path that proves the thesis end to end, built and verified before breadth is added:

1. One product with two variants (size × color) seeded in the database, with stock.
2. Catalog listing with the category and size filters working.
3. Product detail with size selection and add-to-cart.
4. Cart with quantity editing.
5. Checkout: contact → shipping address → shipping method → simulated payment.
6. Account created at payment confirmation.
7. Order appears in order history with correct lines, prices, tax and shipping.
8. Virtual try-on on that product detail page, against the real provider.
9. Chat assistant answering one question on that page.
10. Admin publishing a second product and moving the order to `preparing`.

Everything after this slice is breadth: more filters, more polish, more admin capability, more AI surface.

## Validation Plan

- Run the slice on a deployed staging environment with real providers behind the abstractions.
- Explicitly walk the failed-payment path and confirm no stock is permanently consumed and the cart survives.
- Explicitly walk the duplicate-email path and confirm no second account is created.
- Attempt to oversell the last unit of a variant from two sessions; confirm only one succeeds.
- Upload a valid photo and confirm a try-on result; upload an invalid one and confirm graceful failure.
- Ask the chat assistant about shipping and returns; confirm it does not invent policies.
- Create a product in the backoffice and confirm it appears in the storefront with working filters.

## Definition of Success

- A first-time guest reaches a confirmed order without registering beforehand.
- The order is visible afterwards in the customer's history with correct totals.
- Admin can publish a product and move an order through fulfillment.
- Both AI features work against real providers and can be swapped behind their interfaces.
- The failed-payment, duplicate-email and last-unit scenarios all behave correctly.
- No secrets, personal data or photos leak into logs or error output.
