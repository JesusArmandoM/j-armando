import Link from "next/link";
import { getDb } from "@/db/client.ts";
import { listPublishedCatalogProducts } from "@/db/catalog.ts";
import type { CatalogProductSummary } from "@/db/catalog.ts";
import { ProductCard } from "./product-card";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  let products: CatalogProductSummary[] = [];

  try {
    const db = getDb();
    products = await listPublishedCatalogProducts(db);
  } catch (error) {
    // Graceful fallback when DATABASE_URL is not yet provisioned or DB is unreachable
    console.error("Failed to load catalog products:", error);
  }

  return (
    <main className="catalog">
      <header className="catalog__header">
        <nav className="catalog__breadcrumbs">
          <Link href="/" className="catalog__breadcrumb-link">
            J. Armando
          </Link>
          <span className="catalog__breadcrumb-separator">/</span>
          <span className="catalog__breadcrumb-current">Collection</span>
        </nav>
        <p className="catalog__eyebrow">Autumn / Winter &mdash; Edition 01</p>
        <h1 className="catalog__title">Collection</h1>
        <p className="catalog__lede">
          Architectural silhouettes, quiet materials, and considered cuts.
          Curated for everyday wear.
        </p>
      </header>

      {products.length === 0 ? (
        <div className="catalog__empty" data-testid="catalog-empty">
          <p className="catalog__empty-title">No garments currently available</p>
          <p className="catalog__empty-description">
            The collection is currently being updated. Please check back shortly.
          </p>
        </div>
      ) : (
        <section className="catalog__grid" aria-label="Products" data-testid="catalog-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      )}

      <footer className="catalog__footer">
        <p className="catalog__footer-meta">
          Prices in USD (tax-exclusive). Sales tax calculated at checkout. Free standard shipping across the United States.
        </p>
      </footer>
    </main>
  );
}
