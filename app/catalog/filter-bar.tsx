"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CatalogFilterOptions } from "@/db/catalog.ts";
import type { VariantSize } from "@/db/schema/enums.ts";
import {
  CATALOG_MAX_PRICE_PRESETS,
  CATALOG_SORTS,
  buildCatalogQuery,
  hasActiveFilters,
} from "./filter-params";
import type { CatalogFilters, CatalogSort } from "./filter-params";

const SORT_LABELS: Record<CatalogSort, string> = {
  newest: "Newest",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  name: "Name: A\u2013Z",
};

interface FilterBarProps {
  options: CatalogFilterOptions;
  current: CatalogFilters;
}

/**
 * Catalog filter/sort/reset toolbar. The server remains the source of truth
 * (it passes `current` from the URL), so this component holds no state: every
 * change pushes a new `/catalog?...` history entry and lets the server
 * re-render, which keeps back/forward working without a client store.
 */
export function FilterBar({ options, current }: FilterBarProps) {
  const router = useRouter();

  function update(patch: Partial<CatalogFilters>) {
    const next: CatalogFilters = { ...current, ...patch };
    router.push(`/catalog${buildCatalogQuery(next)}`, { scroll: false });
  }

  return (
    <section className="catalog-filters" aria-label="Filter and sort products">
      <div className="catalog-filters__field">
        <label className="catalog-filters__label" htmlFor="catalog-filter-category">
          Category
        </label>
        <select
          id="catalog-filter-category"
          className="catalog-filters__select"
          value={current.category ?? ""}
          onChange={(event) => update({ category: event.target.value || undefined })}
        >
          <option value="">All categories</option>
          {options.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="catalog-filters__field">
        <label className="catalog-filters__label" htmlFor="catalog-filter-size">
          Size
        </label>
        <select
          id="catalog-filter-size"
          className="catalog-filters__select"
          value={current.size ?? ""}
          onChange={(event) =>
            update({ size: (event.target.value || undefined) as VariantSize | undefined })
          }
        >
          <option value="">All sizes</option>
          {options.sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="catalog-filters__field">
        <label className="catalog-filters__label" htmlFor="catalog-filter-color">
          Color
        </label>
        <select
          id="catalog-filter-color"
          className="catalog-filters__select"
          value={current.color ?? ""}
          onChange={(event) => update({ color: event.target.value || undefined })}
        >
          <option value="">All colors</option>
          {options.colors.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </div>

      <div className="catalog-filters__field">
        <label className="catalog-filters__label" htmlFor="catalog-filter-max-price">
          Max price
        </label>
        <select
          id="catalog-filter-max-price"
          className="catalog-filters__select"
          value={current.maxPrice !== undefined ? String(current.maxPrice) : ""}
          onChange={(event) =>
            update({
              maxPrice: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        >
          <option value="">Any price</option>
          {CATALOG_MAX_PRICE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {`$${preset}`}
            </option>
          ))}
        </select>
      </div>

      <div className="catalog-filters__field">
        <label className="catalog-filters__label" htmlFor="catalog-filter-sort">
          Sort
        </label>
        <select
          id="catalog-filter-sort"
          className="catalog-filters__select"
          value={current.sort}
          onChange={(event) => update({ sort: event.target.value as CatalogSort })}
        >
          {CATALOG_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters(current) ? (
        <Link href="/catalog" className="catalog-filters__reset">
          Reset
        </Link>
      ) : null}
    </section>
  );
}
