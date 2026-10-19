import { describe, expect, it } from "vitest";

import { matchProducts } from "./product-match.ts";
import type { ProductFact } from "./product-match.ts";

function product(overrides: Partial<ProductFact> & Pick<ProductFact, "slug" | "name">): ProductFact {
  return {
    description: "Description",
    composition: "Composition",
    care: "Care",
    basePriceCents: 10000,
    currency: "USD",
    categorySlug: "coats",
    categoryName: "Coats",
    variants: [{ size: "M", color: "Black", stockQty: 5 }],
    sizeChart: [],
    ...overrides,
  };
}

const overcoat = product({
  slug: "longline-wool-overcoat",
  name: "Longline Wool Overcoat",
  basePriceCents: 34900,
  variants: [
    { size: "S", color: "Camel", stockQty: 0 },
    { size: "M", color: "Camel", stockQty: 14 },
    { size: "L", color: "Charcoal", stockQty: 6 },
  ],
});
const blazer = product({
  slug: "double-breasted-linen-blazer",
  name: "Double-Breasted Linen Blazer",
  basePriceCents: 24900,
  categorySlug: "blazers",
  categoryName: "Blazers",
});
const sweater = product({
  slug: "merino-crewneck-sweater",
  name: "Merino Crewneck Sweater",
  basePriceCents: 12900,
  categorySlug: "knitwear",
  categoryName: "Knitwear",
});
const catalog = [overcoat, blazer, sweater];

describe("matchProducts", () => {
  it("matches a full product name regardless of case and punctuation", () => {
    expect(matchProducts("How much is the longline wool overcoat?", catalog)).toEqual([overcoat]);
    expect(matchProducts("PRICE of Longline-Wool-Overcoat", catalog)).toEqual([overcoat]);
  });

  it("matches slug tokens", () => {
    expect(matchProducts("Is longline-wool-overcoat in stock?", catalog)).toEqual([overcoat]);
  });

  it("matches a distinctive partial name", () => {
    expect(matchProducts("How much is the overcoat?", catalog)).toEqual([overcoat]);
    expect(matchProducts("Tell me about the crewneck.", catalog)).toEqual([sweater]);
  });

  it("matches a generic garment category to its published product", () => {
    expect(matchProducts("How much is the coat?", catalog)).toEqual([overcoat]);
    expect(matchProducts("Tell me about coats.", catalog)).toEqual([overcoat]);
    expect(matchProducts("Do you have sweaters?", catalog)).toEqual([sweater]);
    expect(matchProducts("I'm looking for a sport coat.", catalog)).toEqual([blazer]);
    expect(matchProducts("I'm looking for trousers.", catalog)).toEqual([]);
  });

  it("does not guess from a material word alone", () => {
    expect(matchProducts("How much is the wool item?", catalog)).toEqual([]);
    expect(matchProducts("Is it wool?", catalog)).toEqual([]);
  });

  it("lets a specific product mention outrank its category", () => {
    const shortCoat = product({
      slug: "short-wool-coat",
      name: "Short Wool Coat",
      categorySlug: "coats",
      categoryName: "Coats",
    });
    expect(matchProducts("Tell me about the overcoat.", [shortCoat, overcoat])).toEqual([
      overcoat,
    ]);
  });

  it("returns all ties when several products match equally", () => {
    const shirtA = product({
      slug: "cotton-poplin-shirt",
      name: "Cotton Poplin Shirt",
      categorySlug: "shirts",
      categoryName: "Shirts",
    });
    const shirtB = product({
      slug: "linen-camp-shirt",
      name: "Linen Camp Shirt",
      categorySlug: "shirts",
      categoryName: "Shirts",
    });
    const result = matchProducts("How much are the shirts?", [shirtA, shirtB, overcoat]);

    expect(result).toEqual([shirtA, shirtB]);
    expect(matchProducts("Which shirt is it?", [shirtA, shirtB, overcoat])).toEqual([
      shirtA,
      shirtB,
    ]);
  });

  it("returns every named product when the message names more than one", () => {
    const result = matchProducts("the longline overcoat and the linen blazer", catalog);
    expect(result).toEqual([overcoat, blazer]);
  });

  it("never matches rows that are not in the published fact list", () => {
    expect(matchProducts("How much is the Cropped Tweed Jacket?", catalog)).toEqual([]);
    expect(matchProducts("How much is the Satin Evening Gown?", catalog)).toEqual([]);
  });
});
