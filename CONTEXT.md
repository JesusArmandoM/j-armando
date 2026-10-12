# Context

Shared vocabulary for the **J. Armando** clothing store. This file is a glossary only: no plans, no tasks, no decisions, no implementation notes.

## Glossary

### Brand
The storefront is named **J. Armando** (maison-style variant of the founder's name). Earlier design assets labelled the brand `LUMEN STUDIO` / `LUMEN Atelier`; that naming is superseded and must be replaced wherever it appears.

### Storefront
The public customer-facing web application: catalog, product detail, cart, checkout, account, order history, chat assistant, virtual try-on.

### Backoffice
The admin-facing part of the same web application: product, variant, stock and order management. Not a separate product.

### Product
A sellable garment as shoppers see it, e.g. "Blazer Oversize Lana Merino & Seda". A product owns its imagery, description, composition, care and price, and has one or more variants.

### Variant
A concrete sellable combination of **size** and **color** of a product. A variant is the unit that carries stock and is what a cart line refers to. Example: *Blazer Oversize / Size M / Carbon*.

### Size
Garment size (XS–XL). Dimension of the variant matrix.

### Color
Garment color, shown to shoppers as a swatch. Dimension of the variant matrix. Referred to in some design copy as *tonalidad* (tone).

### Stock
Available units of a specific variant. Stock is per variant, never per product.

### Category
A browsing axis for the catalog (e.g. Coats, Blazers, Dresses, Knitwear, Shirts, Trousers). Used by filters.

### Collection
A curated capsule grouping products (e.g. "Spring/Summer – Edition 01"). Distinct from category: a collection is editorial, a category is structural.

### Catalog
The set of published products plus the browsing surface (listing, filters, sorting).

### Guest
A visitor who has not created an account. A guest can browse, filter, view product detail, manage a cart, use the chat assistant and the virtual try-on, and complete checkout.

### Customer
A person with an account, created or linked at payment time. A customer additionally has order history and account access.

### Admin
A role with backoffice access: manages products, variants, stock and orders. Distinct from Customer.

### Account
A customer identity keyed by a unique email. Password is optional at creation (see *Quick Access*).

### Quick Access
Account access established at checkout with an optional password. When no password is set, the customer signs in through an email-based mechanism. Exact mechanism is an open question.

### Cart
The mutable set of variant lines a shopper intends to buy, with quantities. Works for guests and customers.

### Cart Line
One variant in the cart with a quantity. Quantity cannot exceed available stock.

### Checkout
The flow that turns a cart into an order: contact/identity, shipping address, shipping method, payment, confirmation. This is where the account is created or linked.

### Order
An immutable record of a completed purchase: lines, prices, tax, shipping, addresses, payment and fulfillment state.

### Order Line
One variant line inside an order, frozen with the price and tax at the moment of purchase.

### Order Status
The lifecycle state of an order: `pending` → `paid` → `preparing` → `shipped` → `delivered`, plus `cancelled` and `failed`.

### Payment
A payment attempt for an order. In the MVP the payment is **simulated**, but it is modelled as a real payment with states so a real gateway can replace it later.

### Payment Provider
The abstraction that executes a payment. The MVP ships a simulated implementation; a real gateway (e.g. a card processor) can implement the same interface later.

### Payment Status
`pending` → `succeeded` / `failed` / `cancelled`.

### Shipping Method
The delivery speed/service chosen at checkout (e.g. standard, express). Determines shipping cost and delivery expectation.

### Shipping Cost
The charge for delivery. In the MVP it is a simple rule per shipping method (see open questions).

### Fulfillment Status
The delivery-side progression of a paid order: `preparing` → `shipped` → `delivered`. Managed from the backoffice.

### Market
The store sells in the **United States** and prices in **US Dollars (USD)**.

### Currency
**USD**. All displayed prices, order totals and payment amounts are in US dollars.

### Sales Tax
US sales tax applied at **checkout**, calculated from the shipping address (state / ZIP code). Displayed catalog prices are **tax-exclusive**; tax appears as a separate line in the order summary. Rate and nexus rules are jurisdiction-dependent and out of MVP scope beyond a simple configurable rate table.

### Virtual Try-On
The AI feature where a shopper uploads a photo and sees themselves wearing the garment on the product detail page. Produces a *Try-On Result*.

### Try-On Session
One attempt of the virtual try-on: input photo + target variant + generated result + status.

### Photo Subject
The person in an uploaded photo. Sensitive personal data (potentially biometric); subject to consent, retention and deletion rules.

### Chat Assistant
The conversational AI on the storefront that answers shopper questions (sizing, fabric, shipping, product advice). Implemented behind a `ChatAssistant` interface over an LLM.

### Conversation
A chat thread between a shopper (guest or customer) and the Chat Assistant.

### Design Assets
The existing visual references under `stitch_image_based_application/`: one design system document plus three HTML/PNG screens. Treated as a **proposal/direction**, not a rigid specification.

## Rejected / Ambiguous Terms

### "Stylist IA" / "LUMEN Stylist IA"
Ambiguous in the design assets: it is used both for the conversational assistant and for an AI cross-sell recommender. Use **Chat Assistant** for the chatbot and **AI Stylist Cross-Sell** for the deferred recommender ("Coordinados por Stylist IA"). The latter is out of MVP scope.

### "Probador Virtual" / "Fitting Room" / "Virtual Dressing Room"
Use **Virtual Try-On**.

### "Pasarela de pago" / "Payment Gateway"
Use **Payment Provider**. The MVP implementation is simulated, so "gateway" would overstate it.

### "Carrito" / "Cesta"
Use **Cart**.

### "Usuario" / "User"
Ambiguous: a guest, a customer and an admin are all "users" in casual speech. Use **Guest**, **Customer** or **Admin** explicitly.

### "Producto" used for a size/color combination
Use **Product** for the garment and **Variant** for the sellable size/color combination.

### "FITIQ" / "Fit Predictor" / "Ajuste recomendado"
Use **Fit Recommendation**. Deferred feature, out of MVP scope.

### "LUMEN STUDIO" / "LUMEN Atelier"
Superseded brand naming. Use **J. Armando**.
