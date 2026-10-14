import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="product-not-found" data-testid="product-not-found">
      <p className="product-not-found__eyebrow">404</p>
      <h1 className="product-not-found__title">This garment is no longer available</h1>
      <p className="product-not-found__description">
        The piece you were looking for may have sold out, been archived, or never
        existed. Explore the collection to find something else.
      </p>
      <p className="product-not-found__actions">
        <Link href="/catalog" className="product-not-found__link">
          Back to the collection
        </Link>
      </p>
    </main>
  );
}
