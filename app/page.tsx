import Link from "next/link";

export default function Page() {
  return (
    <main className="landing">
      <p className="landing__eyebrow">Autumn / Winter &mdash; Edition 01</p>
      <h1 className="landing__title">J. Armando</h1>
      <p className="landing__lede">
        Considered garments, cut with precision. A clothing house for everyday
        silhouettes &mdash; architectural tailoring, quiet materials, and an
        exact fit.
      </p>
      <div className="landing__actions">
        <Link href="/catalog" className="landing__button">
          Explore Collection
        </Link>
      </div>
      <p className="landing__meta">
        Free standard shipping across the United States. Prices in USD.
      </p>
    </main>
  );
}

