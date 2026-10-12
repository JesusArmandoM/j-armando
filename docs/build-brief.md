# Build Brief

Project: **J. Armando** — clothing e-commerce with AI shopping assistance.
Status: discovery complete, implementation not started.

## Problem

A new fashion brand has no online sales channel. Nothing is being sold yet, so there is no catalog, no customer records and no order history to migrate. The brand needs a real, production-grade storefront that can take orders end to end: shoppers must be able to discover garments, filter and sort them, understand fit and fabric, decide, and pay.

Two AI capabilities are central to the value proposition and must be genuinely useful, not decorative:

1. A **chat assistant** that answers shopper questions in natural language.
2. A **virtual try-on** on the product detail page, where the shopper uploads a photo and sees themselves wearing the garment.

Both must be real, backed by external services, and hidden behind our own interfaces so providers can be swapped or simulated without touching store code.

## Current Workaround / Existing System

None. Brand-new business, no prior online sales channel, no existing catalog or customer base. The design assets under `stitch_image_based_application/` are a visual proposal produced before this brief; they are not a working system.

## Target Users

| User | What they need |
| --- | --- |
| **Guest** | Browse, filter, sort, inspect a garment, try it on, ask questions, buy without friction. |
| **Customer** | Everything a guest can do, plus order history and account access after paying. |
| **Admin** | Manage products, variants, stock and orders from a backoffice. |

The buyer and the end user are the same person for MVP purposes. No gift purchase, no multi-tenant organizations.

## Goals

- A production e-commerce storefront for a clothing brand, market: United States (USD).
- Product catalog with variants (size/color), per-variant stock, filters (category, size, color, price) and sorting.
- Product detail with imagery, composition, care, size selection and fit hints.
- Guest-friendly cart that stays usable without registration.
- Checkout that works as a guest and creates or links the account at payment time, so orders can be tracked later.
- Simulated payment behind a replaceable provider interface, including failure and pending outcomes.
- Shipping address, shipping method/cost and fulfillment states (paid → preparing → shipped → delivered).
- Order history for customers.
- A minimal backoffice to manage products, variants, stock and orders.
- A real chat assistant (LLM) on the storefront.
- A real virtual try-on (external service) on the product detail page.

## Non-Goals

Explicitly out of scope for the MVP:

- A real payment gateway (cards, 3-D Secure, PCI scope). The interface must allow adding one later.
- Email verification of accounts and password recovery.
- Social login (Google/Apple).
- Multi-country, multi-currency, multi-language storefronts.
- Native mobile app or public third-party API.
- **AI Stylist Cross-Sell** ("Coordinados por Stylist IA" in the design assets).
- **Fit Recommendation** engine ("FITIQ" / fit predictor in the design assets).
- Newsletter subscription and marketing automation.
- Customer-facing order tracking portal (fulfillment state is visible in order history, but no carrier integration).
- Returns/refunds workflow and the 30-day satisfaction guarantee flow described in the design assets.
- Advanced merchandising: editorial collections/capsules beyond basic catalog grouping, loyalty, gift cards.

## MVP Slice

A single vertical slice that proves the core purchase flow and includes the riskiest feature (virtual try-on) rather than postponing it.

1. Browse catalog with filters and sorting.
2. Open product detail, pick a size/color variant.
3. Run virtual try-on from the product detail page.
4. Ask the chat assistant a question.
5. Add to cart, adjust quantities.
6. Checkout as a guest: contact, shipping address, shipping method, simulated payment (including a failed payment path).
7. Account is created or linked at payment confirmation.
8. Receive order confirmation; see the order in order history.
9. Admin publishes a product and moves the order to `preparing`.

See `mvp-scope.md` for the detailed included/excluded lists and the first vertical slice.

## Validation Plan

- Walk the slice end to end on a deployed staging environment with real providers wired behind the abstractions.
- Verify the failed-payment path explicitly: order is not marked paid, cart is recoverable, no stock is permanently consumed.
- Verify a guest can complete a purchase without ever logging in, and can reach the same order afterwards.
- Verify a returning customer with an existing email is asked to sign in rather than getting a duplicate account.
- Verify stock cannot be oversold when two shoppers buy the last unit of a variant.
- Verify the virtual try-on returns a usable result for a valid photo and degrades gracefully on failure/timeout.
- Verify the chat assistant answers within the store's scope and does not invent policies (shipping, returns, prices).

## Success Criteria

- A first-time guest can go from landing page to a confirmed order without creating an account in advance.
- The order appears in the customer's history with correct lines, prices, tax and shipping.
- Admin can create a product with variants and stock and see it live in the storefront.
- Both AI features work with real providers; switching a provider requires changes only behind its interface.
- No secrets, personal data or photos are exposed in logs or error messages.

## Notes

- **Documents and UI copy are in English** by explicit choice. The market is the United States, so the storefront copy must be rewritten from the Spanish shown in the design assets.
- **Market, currency and tax are confirmed**: United States / USD / US sales tax added at checkout based on the shipping address. Catalog prices are tax-exclusive and the order summary shows tax as a separate line. This differs from the design assets, which show an IVA-included price.
- The account/password model is deliberately minimal (no verification, no recovery) at the user's request. This is recorded as a production risk in `risks-and-open-questions.md`.
- The design assets are a **proposal and may be redesigned** where the MVP scope requires it. See the root `DESIGN.md`.
