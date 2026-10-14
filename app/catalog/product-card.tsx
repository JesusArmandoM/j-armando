import Image from "next/image";
import Link from "next/link";
import type { CatalogProductSummary } from "@/db/catalog.ts";
import { formatPriceUSD } from "@/db/catalog.ts";

interface ProductCardProps {
  product: CatalogProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const imageSrc = product.primaryImage?.path ?? "/images/placeholder.svg";
  const imageAlt = product.primaryImage?.altText ?? product.name;
  const formattedPrice = formatPriceUSD(product.basePriceCents);

  return (
    <article className="product-card" data-testid="product-card">
      <Link
        href={`/products/${product.slug}`}
        className="product-card__link"
        aria-label={`${product.name} - ${formattedPrice}`}
      >
        <div className="product-card__media">
          <Image
            src={imageSrc}
            alt={imageAlt}
            width={400}
            height={500}
            className="product-card__image"
            unoptimized
          />
        </div>
        <div className="product-card__info">
          <p className="product-card__category">{product.categoryName}</p>
          <h2 className="product-card__title">{product.name}</h2>
          <p className="product-card__price">{formattedPrice}</p>
        </div>
      </Link>
    </article>
  );
}
