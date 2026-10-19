# Feature Implementation Spec: Admin creates a product with variants and stock

## Source Feature

- `id`: `admin-product-create`
- `area`: `backoffice`
- `depends_on`: `["admin-role-gate"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Enable an authenticated administrator to create a new catalog product with its core fields (name, category, USD base price, description, composition, care instructions, optional primary image URL) and one or more size/color variants with per-variant stock quantities, and view the saved product and its variants in the backoffice.

1. **Input Validation (`app/admin/products/product-input.ts`):**
   - Pure validation and parsing module (`validateAdminProductInput` and `parsePriceDollarsToCents`).
   - Converts USD dollar input (e.g. `"249.00"` or `"249"`) into integer cents (`24900`) using exact string/integer arithmetic without floating-point drift, or accepts integer `basePriceCents`.
   - Validates required core product fields (`name`, `categoryId`, `basePrice`, `description`, `composition`, `care`).
   - Validates `variants` list: requires at least one variant, valid garment size (`XS`, `S`, `M`, `L`, `XL`), non-empty color name, valid hex swatch (defaulting when omitted), non-negative integer stock per variant (`stockQty >= 0`), and rejects duplicate `(size, color)` combinations (case-insensitive on color).
2. **Backoffice Product Repository (`db/admin-products.ts`):**
   - `listAdminCategories(db)`: lists all categories ordered by `sortOrder` ascending, then `name` ascending.
   - `listAdminProducts(db)`: lists all products across all lifecycle states (`draft`, `published`, `archived`), ordered by `createdAt` descending, including category metadata, `basePriceCents`, `status`, `variantCount`, and `totalStock` (sum of per-variant `stockQty`).
   - `getAdminProductById(db, id)`: returns the full backoffice detail for a product including its category, images, and variants (with each variant's `id`, `sku`, `size`, `color`, `colorHex`, `stockQty`), or `null` if not found.
   - `createProductWithVariants(db, input)`: validates input and runs a single database transaction that checks category existence, generates a collision-safe URL slug, inserts the `product` row in `draft` status, optionally inserts a primary `product_image` row, and inserts each `variant` row with its individual `stockQty` and unique SKU.
3. **Admin Products API (`app/api/admin/products/route.ts`):**
   - Guarded by `getAdminSession()`. Returns 401 when unauthenticated and 403 when lacking the `admin` role.
   - `GET /api/admin/products`: returns `{ ok: true, products, categories }` with `Cache-Control: no-store`.
   - `POST /api/admin/products`: validates the request payload and creates the product and variants. Returns HTTP 201 `{ ok: true, product }` on success, or HTTP 400 `{ ok: false, error, fieldErrors }` on invalid input.
4. **Backoffice Product UI (`app/admin/products/`):**
   - `/admin/products` (`app/admin/products/page.tsx`): lists all backoffice products with name, slug, category, status badge, USD base price (`formatPriceUSD`), variant count, and total variant stock, plus a "New Product" action linking to `/admin/products/new`.
   - `/admin/products/new` (`app/admin/products/new/page.tsx` & `create-product-form.tsx`): interactive form allowing an admin to fill core product fields, dynamically add/remove variant rows (size, color, color swatch hex, per-variant stock), see clear validation errors on invalid submissions, and redirect to the saved product detail page on creation.
   - `/admin/products/[id]` (`app/admin/products/[id]/page.tsx`): backoffice product detail view displaying core fields, `draft` status badge, USD base price, composition, care instructions, and the variant inventory table showing each variant's SKU, size, color, and per-variant stock quantity.

## Non-Goals

- Product publishing and archiving state transitions (handled in `admin-product-publish`).
- Bulk CSV/JSON product import.
- Multi-file binary upload pipeline or external object storage (optional image path/URL is sufficient for MVP).

## Acceptance Scenarios

### Scenario 1: Creating a product with two variants and stock persists and is listed in the backoffice
Given an authenticated admin on `/admin/products/new`
When they submit a valid product with core fields and two variants (e.g., Size `S` / `Black` with stock `12` and Size `M` / `Black` with stock `8`)
Then the product is created in `draft` status with its two variants, is visible on `/admin/products/[id]` with both variants and their stock quantities, and appears in the `/admin/products` backoffice list with `variantCount: 2` and `totalStock: 20`.

### Scenario 2: Stock is stored per variant, not per product
Given a created product with multiple variants having distinct stock quantities (e.g. `S / Ivory` with stock `15` and `L / Charcoal` with stock `0`)
When reading the product from the database and viewing `/admin/products/[id]`
Then each variant row stores and displays its own `stockQty` (`15` and `0` respectively), and the `product` table stores no product-level stock column.

### Scenario 3: Invalid input is rejected with a clear message
Given an admin submitting the product creation form or `POST /api/admin/products`
When the payload has missing required fields, a negative or non-numeric price, negative or non-integer variant stock, zero variants, or duplicate `(size, color)` variants
Then the request is rejected with HTTP 400 and a clear validation message, and no product or variant rows are written to the database.

### Scenario 4: Backoffice product routes and API enforce the admin role gate
Given an unauthenticated visitor or a non-admin customer account
When requesting `GET /api/admin/products` or `POST /api/admin/products`
Then the API returns HTTP 401 (unauthenticated) or HTTP 403 (forbidden) and performs no database writes.
