import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client.ts";
import {
  getPublishedProductBySlug,
  listSizeChartByCategorySlug,
  listVariantsByProductId,
} from "@/db/catalog.ts";
import type { ProductDetail, SizeChartEntry } from "@/db/catalog.ts";
import type { Variant } from "@/db/schema/index.ts";

import { ProductGallery } from "./product-gallery";
import { SizeGuide } from "./size-guide";
import { TryOnPanel } from "./try-on-panel";
import { VariantSelector } from "./variant-selector";
import { parseVariantSelection } from "./variant-selection";

export const dynamic = "force-dynamic";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProductDetailPageProps) {
  const { slug } = await params;

  let product: ProductDetail | undefined;
  try {
    product = await getPublishedProductBySlug(getDb(), slug);
  } catch (error) {
    console.error("Failed to load product metadata:", error);
  }

  return {
    title: product ? `${product.name} — J. Armando` : "Product not found — J. Armando",
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  let product: ProductDetail | undefined;
  try {
    product = await getPublishedProductBySlug(getDb(), slug);
  } catch (error) {
    // Graceful fallback when DATABASE_URL is not provisioned or the DB is unreachable.
    console.error("Failed to load product detail:", error);
  }

  // notFound() must be called outside the try/catch above: it works by throwing
  // a NEXT_HTTP_ERROR_FALLBACK;404 signal that a surrounding catch would swallow.
  if (!product) {
    notFound();
  }

  // Published category measurements. A read failure must not break the page:
  // the guide is omitted and the rest of the product detail still renders.
  let sizeChart: SizeChartEntry[] = [];
  try {
    sizeChart = await listSizeChartByCategorySlug(getDb(), product.categorySlug);
  } catch (error) {
    console.error("Failed to load product size guide:", error);
  }
  const availableSizes = [...new Set(product.variants.map((variant) => variant.size))];

  const initialSelection = parseVariantSelection(resolvedSearchParams, product.variants);

  // Try-on garment context only. A read failure must not break the product
  // page: render it with no variants so the panel shows its unavailable state.
  let variants: Variant[] = [];
  try {
    variants = await listVariantsByProductId(getDb(), product.id);
  } catch (error) {
    console.error("Failed to load product variants:", error);
  }

  const tryOnVariants = variants
    .filter((variant) => !variant.discontinued)
    .map((variant) => ({
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      stockQty: variant.stockQty,
    }));

  return (
    <main className="product-detail" data-testid="product-detail">
      <nav className="product-detail__breadcrumbs" aria-label="Breadcrumb">
        <Link href="/" className="product-detail__breadcrumb-link">
          J. Armando
        </Link>
        <span className="product-detail__breadcrumb-separator">/</span>
        <Link href="/catalog" className="product-detail__breadcrumb-link">
          Collection
        </Link>
        <span className="product-detail__breadcrumb-separator">/</span>
        <span className="product-detail__breadcrumb-current">{product.name}</span>
      </nav>

      <div className="product-detail__layout">
        <div className="product-detail__media">
          <ProductGallery images={product.images} productName={product.name} />
        </div>

        <div className="product-detail__commentary">
          <p className="product-detail__category">{product.categoryName}</p>
          <h1 className="product-detail__title">{product.name}</h1>
          <VariantSelector
            variants={product.variants}
            basePriceCents={product.basePriceCents}
            initialSelection={initialSelection}
          />

          <p className="product-detail__description">{product.description}</p>

          <dl className="product-detail__specs">
            <div className="product-detail__spec">
              <dt className="product-detail__spec-label">Composition</dt>
              <dd className="product-detail__spec-value" data-testid="product-composition">
                {product.composition}
              </dd>
            </div>
            <div className="product-detail__spec">
              <dt className="product-detail__spec-label">Care</dt>
              <dd className="product-detail__spec-value" data-testid="product-care">
                {product.care}
              </dd>
            </div>
          </dl>

          <SizeGuide rows={sizeChart} availableSizes={availableSizes} />

          <TryOnPanel
            productSlug={product.slug}
            productName={product.name}
            variants={tryOnVariants}
          />
        </div>
      </div>
    </main>
  );
}
