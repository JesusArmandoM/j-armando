import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client.ts";
import { listAdminProducts } from "@/db/admin-products.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Products — J. Armando Backoffice",
};

export default async function AdminProductsPage() {
  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect("/account/signin?returnUrl=/admin/products");
  }

  if (sessionResult.status === "forbidden") {
    return (
      <div className="admin-products-page" data-testid="admin-products-forbidden">
        <p>Access Denied: Admin role required.</p>
      </div>
    );
  }

  const db = getDb();
  const products = await listAdminProducts(db);

  return (
    <div className="admin-products-page" data-testid="admin-products-page">
      <header className="admin-products-header">
        <div>
          <p className="admin-products-eyebrow">Backoffice Inventory</p>
          <h1 className="admin-products-title">Catalog Products</h1>
          <p className="admin-products-subtitle">
            Manage garments, size/color variants, and per-variant stock quantities.
          </p>
        </div>
        <div className="admin-products-actions">
          <Link
            href="/admin/products/new"
            className="admin-btn admin-btn--primary"
            data-testid="create-product-link"
          >
            + New Product
          </Link>
        </div>
      </header>

      {products.length === 0 ? (
        <section className="admin-products-empty" data-testid="admin-products-empty">
          <h2 className="admin-products-empty__title">No products in catalog</h2>
          <p className="admin-products-empty__body">
            Start building the collection by creating your first garment with variants and stock.
          </p>
          <Link href="/admin/products/new" className="admin-btn admin-btn--primary">
            Create First Product
          </Link>
        </section>
      ) : (
        <div className="admin-products-table-wrap">
          <table className="admin-products-table" data-testid="admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Status</th>
                <th>Base Price (USD)</th>
                <th>Variants</th>
                <th>Total Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr
                  key={item.id}
                  data-testid="admin-product-row"
                  data-product-slug={item.slug}
                >
                  <td>
                    <Link
                      href={`/admin/products/${item.id}`}
                      className="admin-products-name-link"
                    >
                      {item.name}
                    </Link>
                    <span className="admin-products-slug">/{item.slug}</span>
                  </td>
                  <td>{item.categoryName}</td>
                  <td>
                    <span
                      className={`admin-products-status admin-products-status--${item.status}`}
                      data-testid={`product-status-${item.slug}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td data-testid={`product-price-${item.slug}`}>
                    {formatPriceUSD(item.basePriceCents)}
                  </td>
                  <td data-testid={`product-variants-${item.slug}`}>
                    {item.variantCount} {item.variantCount === 1 ? "variant" : "variants"}
                  </td>
                  <td data-testid={`product-stock-${item.slug}`}>
                    {item.totalStock} in stock
                  </td>
                  <td>
                    <Link
                      href={`/admin/products/${item.id}`}
                      className="admin-products-view-link"
                    >
                      View &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
