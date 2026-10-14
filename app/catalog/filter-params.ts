import type { VariantSize } from "@/db/schema/enums.ts";

// Pure catalog filter/sort URL helpers. No React and no DB: the catalog page
// parses `searchParams` with these, and the client filter bar builds the next
// URL with them. All listing state lives in the query string so every filtered
// view is shareable and the browser back/forward buttons move between states.

/** Supported orderings, in the order they are offered to the shopper. */
export const CATALOG_SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Valid size facet values (XS–XL), matching the `variant_size` enum. */
export const CATALOG_SIZES = ["XS", "S", "M", "L", "XL"] as const;

/** Whole-US-dollar max-price presets offered by the toolbar (see spec). */
export const CATALOG_MAX_PRICE_PRESETS = [100, 150, 200, 250, 300] as const;

/**
 * Canonical, fully-resolved filter state. `sort` is always present (defaults to
 * `newest`); each facet is absent when unset.
 */
export interface CatalogFilters {
  category?: string;
  size?: VariantSize;
  color?: string;
  maxPrice?: number;
  sort: CatalogSort;
}

const DEFAULT_SORT: CatalogSort = "newest";

function isCatalogSort(value: string): value is CatalogSort {
  return (CATALOG_SORTS as readonly string[]).includes(value);
}

function isCatalogSize(value: string): value is VariantSize {
  return (CATALOG_SIZES as readonly string[]).includes(value);
}

/** Takes the first value of an array param and trims it; empty becomes undefined. */
function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves a raw `searchParams` record into a canonical {@link CatalogFilters}.
 *
 * - Only valid enum `size` values are accepted; anything else is ignored.
 * - `maxPrice` must be a positive integer (whole dollars); otherwise ignored.
 * - Unknown/absent `sort` falls back to `newest`.
 * - Unknown `category`/`color` strings are kept and simply match nothing (the
 *   UI only ever emits known values).
 */
export function parseCatalogSearchParams(
  input: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const filters: CatalogFilters = { sort: DEFAULT_SORT };

  const category = firstValue(input.category);
  if (category) filters.category = category;

  const size = firstValue(input.size);
  if (size && isCatalogSize(size)) filters.size = size;

  const color = firstValue(input.color);
  if (color) filters.color = color;

  const maxPrice = firstValue(input.maxPrice);
  if (maxPrice && /^\d+$/.test(maxPrice)) {
    const parsed = Number(maxPrice);
    if (parsed > 0) filters.maxPrice = parsed;
  }

  const sort = firstValue(input.sort);
  if (sort && isCatalogSort(sort)) filters.sort = sort;

  return filters;
}

/**
 * Builds the `/catalog` query suffix for the given filters (`""` or
 * `"?..."`), emitting only non-default params in a fixed order (`category`,
 * `size`, `color`, `maxPrice`, `sort`). Returns `""` when everything is default
 * so callers can write `` `/catalog${query}` ``.
 */
export function buildCatalogQuery(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.size) params.set("size", filters.size);
  if (filters.color) params.set("color", filters.color);
  if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when any facet is set or the sort differs from the default. */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.category !== undefined ||
    filters.size !== undefined ||
    filters.color !== undefined ||
    filters.maxPrice !== undefined ||
    filters.sort !== DEFAULT_SORT
  );
}
