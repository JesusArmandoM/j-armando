import Link from "next/link";

import { getDb } from "@/db/client.ts";
import { listPublishedCatalogFilterOptions, listPublishedCatalogProducts } from "@/db/catalog.ts";
import type { CatalogFilterOptions, CatalogProductSummary } from "@/db/catalog.ts";
import { FilterBar } from "./filter-bar";
import { hasActiveFilters, parseCatalogSearchParams } from "./filter-params";
import { ProductCard } from "./product-card";

export const dynamic = "force-dynamic";

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const filters = parseCatalogSearchParams(await searchParams);
  let products: CatalogProductSummary[] = [];
  let options: CatalogFilterOptions = { categories: [], sizes: [], colors: [] };

  try {
    const db = getDb();
    [products, options] = await Promise.all([
      listPublishedCatalogProducts(db, filters),
      listPublishedCatalogFilterOptions(db),
    ]);
  } catch (error) {
    // Graceful fallback when DATABASE_URL is not yet provisioned or DB is unreachable
    console.error("Failed to load catalog products:", error);
  }

  const isFiltered = hasActiveFilters(filters);
  const countLabel = products.length === 1 ? "1 garment" : `${products.length} garments`;

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

      <FilterBar options={options} current={filters} />

      <p className="catalog__results" aria-live="polite" data-testid="catalog-results-count">
        {countLabel}
      </p>

      {products.length > 0 ? (
        <section className="catalog__grid" aria-label="Products" data-testid="catalog-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      ) : isFiltered ? (
        <div
          className="catalog__empty catalog__empty--filtered"
          data-testid="catalog-filtered-empty"
        >
          <p className="catalog__empty-title">No matching garments</p>
          <p className="catalog__empty-description">
            Try adjusting or clearing your filters to see more of the collection.
          </p>
          <Link href="/catalog" className="catalog-filters__reset">
            Reset filters
          </Link>
        </div>
      ) : (
        <div className="catalog__empty" data-testid="catalog-empty">
          <p className="catalog__empty-title">No garments currently available</p>
          <p className="catalog__empty-description">
            The collection is currently being updated. Please check back shortly.
          </p>
        </div>
      )}

      <footer className="catalog__footer">
        <p className="catalog__footer-meta">
          Prices in USD (tax-exclusive). Sales tax calculated at checkout. Free standard shipping across the United States.
        </p>
      </footer>
    </main>
  );
}
