import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDb } from "@/db/client.ts";
import { getAdminProductById } from "@/db/admin-products.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Product Detail — J. Armando Backoffice",
};

interface AdminProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailPage({
  params,
}: AdminProductDetailPageProps) {
  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect("/account/signin?returnUrl=/admin/products");
  }

  if (sessionResult.status === "forbidden") {
    return (
      <div className="admin-products-page" data-testid="admin-product-detail-forbidden">
        <p>Access Denied: Admin role required.</p>
      </div>
    );
  }

  const { id } = await params;
  const db = getDb();
  const productDetail = await getAdminProductById(db, id);

  if (!productDetail) {
    notFound();
  }

  return (
    <div className="admin-products-page" data-testid="admin-product-detail">
      <header className="admin-products-header">
        <div>
          <p className="admin-products-eyebrow">
            <Link href="/admin/products" className="admin-products-back-link">
              &larr; All Products
            </Link>
          </p>
          <div className="admin-products-title-row">
            <h1 className="admin-products-title" data-testid="detail-product-name">
              {productDetail.name}
            </h1>
            <span
              className={`admin-products-status admin-products-status--${productDetail.status}`}
              data-testid="detail-product-status"
            >
              {productDetail.status}
            </span>
          </div>
          <p className="admin-products-subtitle" data-testid="detail-product-slug">
            Slug: /{productDetail.slug} &middot; Category: {productDetail.categoryName}
          </p>
        </div>
        <div className="admin-products-actions">
          <Link href="/admin/products/new" className="admin-btn admin-btn--secondary">
            + Create Another
          </Link>
        </div>
      </header>

      <div className="admin-products-detail-grid">
        <section className="admin-products-panel">
          <h2 className="admin-products-panel__title">Garment Overview</h2>
          <dl className="admin-products-dl">
            <div className="admin-products-dl__row">
              <dt>Base Price (USD, tax-exclusive)</dt>
              <dd data-testid="detail-product-price">
                {formatPriceUSD(productDetail.basePriceCents)}
              </dd>
            </div>
            <div className="admin-products-dl__row">
              <dt>Category</dt>
              <dd data-testid="detail-product-category">{productDetail.categoryName}</dd>
            </div>
            <div className="admin-products-dl__row">
              <dt>Total Inventory Across Variants</dt>
              <dd data-testid="detail-product-total-stock">
                {productDetail.totalStock} units across {productDetail.variants.length}{" "}
                {productDetail.variants.length === 1 ? "variant" : "variants"}
              </dd>
            </div>
            <div className="admin-products-dl__row">
              <dt>Description</dt>
              <dd data-testid="detail-product-description">
                {productDetail.description}
              </dd>
            </div>
            <div className="admin-products-dl__row">
              <dt>Composition / Material</dt>
              <dd data-testid="detail-product-composition">
                {productDetail.composition}
              </dd>
            </div>
            <div className="admin-products-dl__row">
              <dt>Care Instructions</dt>
              <dd data-testid="detail-product-care">{productDetail.care}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-products-panel">
          <h2 className="admin-products-panel__title">
            Variants & Per-Variant Stock ({productDetail.variants.length})
          </h2>
          <div className="admin-products-table-wrap">
            <table
              className="admin-products-table"
              data-testid="detail-variants-table"
            >
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Size</th>
                  <th>Color</th>
                  <th>Unit Price</th>
                  <th>Stock Qty</th>
                </tr>
              </thead>
              <tbody>
                {productDetail.variants.map((v) => (
                  <tr
                    key={v.id}
                    data-testid="detail-variant-row"
                    data-variant-size={v.size}
                    data-variant-color={v.color}
                  >
                    <td className="admin-products-mono">{v.sku ?? "—"}</td>
                    <td>{v.size}</td>
                    <td>
                      <span
                        className="admin-products-swatch"
                        style={{ backgroundColor: v.colorHex }}
                        aria-hidden="true"
                      />
                      {v.color}
                    </td>
                    <td>
                      {formatPriceUSD(
                        v.priceOverrideCents ?? productDetail.basePriceCents,
                      )}
                    </td>
                    <td data-testid={`variant-stock-${v.size}-${v.color}`}>
                      {v.stockQty} in stock
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
