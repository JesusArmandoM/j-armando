# Domain Model

Project: **J. Armando**. Glossary terms are defined in `../CONTEXT.md`.

## Core Concepts

### Catalog side
- **Product** — a garment: name, description, imagery, composition, care, base price, category, collection.
- **Variant** — the sellable unit: `product` + `size` + `color`, with its own `stock`, optional SKU and optional price override.
- **Category** — structural browsing axis (Coats, Blazers, Dresses, Knitwear, Shirts, Trousers…).
- **Collection** — editorial capsule grouping products. Optional in the MVP beyond basic grouping.

### Shopping side
- **Cart / CartLine** — mutable intent to buy; a line is a `variant` + `quantity`.
- **Checkout** — converts a cart into an order; captures contact/identity, shipping address, shipping method and payment.
- **Order / OrderLine** — immutable purchase record with frozen prices and sales tax. Sales tax is calculated at checkout from the shipping address; it is not included in catalog prices.
- **Payment** — one payment attempt for an order, executed through a **Payment Provider** (simulated in the MVP).
- **ShippingMethod / Address / FulfillmentStatus** — delivery side of an order.

### Identity side
- **Guest** — no account; can do everything except account/order-history access.
- **Account** — customer identity, unique `email`, optional password.
- **Admin** — role with backoffice access.

### AI side
- **ChatAssistant / Conversation** — conversational help on the storefront.
- **TryOnSession** — photo + target variant → generated result.

## Relationships

```
Product 1 ─── * Variant          (one variant per size × color combination)
Variant  * ─── 1 Product
Variant  1 ─── 1 Stock           (stock is per variant)

Category 1 ─── * Product
Product  * ─── * Collection      (optional in MVP)

Cart     1 ─── * CartLine
CartLine * ─── 1 Variant
Cart     * ─── 0..1 Account      (a guest cart may have no owner)

Order    1 ─── * OrderLine
OrderLine * ─── 1 Variant        (frozen snapshot of name/price/tax at purchase)
Order    1 ─── 1 Payment         (1..n once retries are allowed)
Order    * ─── 1 Account         (created or linked at payment time)
Order    1 ─── 1 Address         (shipping)
Order    1 ─── 1 ShippingMethod

Account  1 ─── * Order
Account  1 ─── 0..1 Password     (password is optional → Quick Access)

Conversation 1 ─── * Message
Conversation * ─── 0..1 Account  (guest conversations have no owner)

TryOnSession * ─── 1 Variant
TryOnSession 1 ─── 1 Photo       (PhotoSubject: sensitive personal data)
TryOnSession * ─── 0..1 Account
```

## States and Lifecycles

### Product
```
draft ──publish──> published ──archive──> archived
```
Only `published` products are visible in the storefront. Only admins change state.

### Variant / Stock
- `available` — stock > 0
- `out_of_stock` — stock = 0 (still visible and filterable)
- `discontinued` — hidden from the storefront, cannot be added to cart

Stock only decreases through an order; it is restored on cancellation.

### Cart
```
active ──checkout success──> converted (becomes an Order)
active ──abandoned/expired──> expired
```
A guest cart is preserved across the session and is merged into the account at payment time.

### Payment
```
pending ──provider says success──> succeeded
pending ──provider says failure──> failed ──retry──> pending
pending ──cancelled/expired──> cancelled
```
An order is `paid` only when its payment is `succeeded`.

### Order
```
created (payment pending)
   │ payment succeeded
   ▼
paid ──admin starts handling──> preparing ──handed to carrier──> shipped ──confirmed──> delivered

created ──payment failed / cancelled──> failed / cancelled
paid    ──cancel before shipping──> cancelled (stock restored)
```
`Order Status` and `Fulfillment Status` are related but not identical: fulfillment (`preparing`/`shipped`/`delivered`) only applies once the order is `paid`.

### Account
```
created (email captured, unverified) ──signs in──> active
```
No verification state in the MVP. No password recovery flow in the MVP.

### Conversation
```
active ──inactivity / user closes──> archived
```

### TryOnSession
```
photo_uploaded ──request──> generating ──provider ok──> ready
                              │
                              └──provider error/timeout──> failed
ready ──retention limit──> deleted
```

## Important Scenarios

### S1. Guest buys without registering first
Guest browses and filters → opens product detail → runs virtual try-on → adds variant to cart → checkout with contact email + shipping address + shipping method → simulated payment succeeds → account is created (or linked if the email exists) at confirmation → order is `paid` → guest sees confirmation and can reach the order.

### S2. Returning customer at checkout
Guest enters an email that already has an account. The system asks them to sign in instead of creating a duplicate. The cart contents carry over to the signed-in session.

### S3. Payment failure
Simulated provider returns `failed`. The order stays `created`/`failed`, no stock is permanently consumed, the cart is recoverable, and the shopper can retry the payment.

### S4. Last unit in stock
Two shoppers both have the last unit of a variant in their carts. Only one order line can consume it; the other gets a clear message and the line is adjusted, never oversold.

### S5. Virtual try-on fails
Photo is invalid, the provider times out, or the provider errors. The session goes to `failed`, the shopper sees a clear message, and browsing/adding to cart is unaffected.

### S6. Admin publishes a product
Admin creates product + variants + stock → publishes → product appears in the storefront with working filters and sorting.

### S7. Guest uses the chat assistant
Guest asks about sizing, fabric, shipping or a product. The assistant answers within store scope; it must not invent policies.

## Edge Cases

- **Cart ownership at checkout**: a guest cart must survive the account creation/linking step and end up attached to the account.
- **Duplicate email at checkout**: must not create a second account; must not silently discard the guest cart.
- **Password optional**: a customer who never set a password must still be able to reach their orders later. The sign-in mechanism for this case is an **open question**.
- **Stock exhaustion during checkout**: stock must be reserved or re-validated at payment time; concurrent checkouts of the last unit must not both succeed.
- **Price/tax changes between cart and order**: the order freezes prices and sales tax at purchase time. Sales tax is calculated at checkout from the shipping address (state / ZIP), so the cart shows an estimated total and the final total is only known once the address is captured.
- **Mixed-stock cart**: some lines available, some not. Checkout must handle partial availability explicitly.
- **Photo privacy**: uploaded photos are sensitive personal data. Consent, retention limit and deletion must be defined; photos of minors must be considered.
- **Try-on on an out-of-stock or discontinued variant**: should be blocked or clearly marked.
- **Order cancellation after shipping**: cannot restore stock; must be a distinct path (out of MVP scope).
- **Guest conversation vs. customer conversation**: a guest conversation may have no owner; decide whether it survives a sign-in.
- **Empty cart / empty catalog / empty order history**: all need defined empty states.
- **Admin is also a customer**: the same person may hold both roles; the role model must allow it.
