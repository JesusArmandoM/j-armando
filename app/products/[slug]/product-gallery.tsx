"use client";

import { useState } from "react";
import Image from "next/image";

import type { ProductDetailImage } from "@/db/catalog.ts";

interface ProductGalleryProps {
  images: ProductDetailImage[];
  productName: string;
}

/**
 * Still-image gallery for the product detail page (no zoom/lightbox/video in
 * this slice). Selecting a thumbnail swaps the primary image.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const safeIndex = images.length > 0 ? Math.min(selectedIndex, images.length - 1) : 0;
  const activeImage = images[safeIndex];
  const primarySrc = activeImage?.path ?? "/images/placeholder.svg";
  const primaryAlt = activeImage?.altText ?? productName;

  return (
    <div className="product-gallery" data-testid="product-gallery">
      <div className="product-gallery__primary">
        <Image
          src={primarySrc}
          alt={primaryAlt}
          width={800}
          height={1000}
          className="product-gallery__primary-image"
          unoptimized
        />
      </div>

      {images.length > 1 ? (
        <ul
          className="product-gallery__thumbnails"
          data-testid="product-gallery-thumbnails"
        >
          {images.map((image, index) => (
            <li key={`${image.path}-${image.position}`} className="product-gallery__thumbnail-item">
              <button
                type="button"
                className={
                  index === safeIndex
                    ? "product-gallery__thumbnail product-gallery__thumbnail--active"
                    : "product-gallery__thumbnail"
                }
                onClick={() => setSelectedIndex(index)}
                aria-label={`View ${image.altText}`}
                aria-pressed={index === safeIndex}
                data-testid="product-gallery-thumbnail"
              >
                <Image
                  src={image.path}
                  alt={image.altText}
                  width={120}
                  height={150}
                  className="product-gallery__thumbnail-image"
                  unoptimized
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
