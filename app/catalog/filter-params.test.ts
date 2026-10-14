import { describe, expect, it } from "vitest";

import {
  CATALOG_MAX_PRICE_PRESETS,
  CATALOG_SIZES,
  CATALOG_SORTS,
  buildCatalogQuery,
  hasActiveFilters,
  parseCatalogSearchParams,
} from "./filter-params";

describe("parseCatalogSearchParams", () => {
  it("returns only the default sort for an empty query", () => {
    expect(parseCatalogSearchParams({})).toEqual({ sort: "newest" });
  });

  it("parses each valid facet", () => {
    expect(
      parseCatalogSearchParams({
        category: "coats",
        size: "M",
        color: "Sky Blue",
        maxPrice: "150",
        sort: "price-asc",
      }),
    ).toEqual({
      category: "coats",
      size: "M",
      color: "Sky Blue",
      maxPrice: 150,
      sort: "price-asc",
    });
  });

  it("takes the first value of an array param", () => {
    expect(parseCatalogSearchParams({ size: ["M", "L"] }).size).toBe("M");
  });

  it("ignores an invalid size value", () => {
    expect(parseCatalogSearchParams({ size: "XXL" }).size).toBeUndefined();
  });

  it("falls back to newest for an unknown sort", () => {
    expect(parseCatalogSearchParams({ sort: "bogus" }).sort).toBe("newest");
  });

  it("ignores non-positive or non-integer maxPrice", () => {
    expect(parseCatalogSearchParams({ maxPrice: "0" }).maxPrice).toBeUndefined();
    expect(parseCatalogSearchParams({ maxPrice: "-5" }).maxPrice).toBeUndefined();
    expect(parseCatalogSearchParams({ maxPrice: "12.5" }).maxPrice).toBeUndefined();
    expect(parseCatalogSearchParams({ maxPrice: "abc" }).maxPrice).toBeUndefined();
  });

  it("trims values and drops empty strings", () => {
    expect(parseCatalogSearchParams({ category: "  coats  " }).category).toBe("coats");
    expect(parseCatalogSearchParams({ color: "   " }).color).toBeUndefined();
  });

  it("keeps unknown category/color values (they simply match nothing)", () => {
    const filters = parseCatalogSearchParams({ category: "unknown", color: "Chartreuse" });
    expect(filters.category).toBe("unknown");
    expect(filters.color).toBe("Chartreuse");
  });
});

describe("buildCatalogQuery", () => {
  it("returns an empty string for default filters", () => {
    expect(buildCatalogQuery({ sort: "newest" })).toBe("");
  });

  it("emits non-default params in a fixed order", () => {
    expect(
      buildCatalogQuery({
        category: "coats",
        size: "M",
        color: "Sky Blue",
        maxPrice: 150,
        sort: "price-asc",
      }),
    ).toBe("?category=coats&size=M&color=Sky+Blue&maxPrice=150&sort=price-asc");
  });

  it("omits the sort param when it is the default", () => {
    expect(buildCatalogQuery({ category: "coats", sort: "newest" })).toBe("?category=coats");
  });

  it("round-trips through parseCatalogSearchParams", () => {
    const filters = {
      category: "blazers",
      size: "L" as const,
      color: "Ivory",
      maxPrice: 250,
      sort: "price-desc" as const,
    };
    expect(parseCatalogSearchParams(Object.fromEntries(new URLSearchParams(buildCatalogQuery(filters))))).toEqual(
      filters,
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false for default filters", () => {
    expect(hasActiveFilters({ sort: "newest" })).toBe(false);
  });

  it("is true when any facet is set", () => {
    expect(hasActiveFilters({ size: "M", sort: "newest" })).toBe(true);
    expect(hasActiveFilters({ category: "coats", sort: "newest" })).toBe(true);
    expect(hasActiveFilters({ color: "Navy", sort: "newest" })).toBe(true);
    expect(hasActiveFilters({ maxPrice: 150, sort: "newest" })).toBe(true);
  });

  it("is true when the sort differs from the default", () => {
    expect(hasActiveFilters({ sort: "name" })).toBe(true);
  });
});

describe("filter constants", () => {
  it("exposes the documented sorts, sizes and max-price presets", () => {
    expect(CATALOG_SORTS).toEqual(["newest", "price-asc", "price-desc", "name"]);
    expect(CATALOG_SIZES).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(CATALOG_MAX_PRICE_PRESETS).toEqual([100, 150, 200, 250, 300]);
  });
});
