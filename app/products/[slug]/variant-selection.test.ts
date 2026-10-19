import { describe, expect, it } from "vitest";

import type { ProductDetailVariant } from "@/db/catalog.ts";
import type { VariantSize } from "@/db/schema/enums.ts";

import {
  buildVariantHref,
  getColorOptionLabel,
  getColorOptionState,
  getColorOptions,
  getDisplayPriceCents,
  getSelectedVariant,
  getSizeOptionLabel,
  getSizeOptionState,
  getSizeOptions,
  getStockMessage,
  isCombinationSelectable,
  parseVariantSelection,
  selectColor,
  selectSize,
} from "./variant-selection";

// Pure selection-model coverage for docs/specs/product-variant-selection.md
// scenarios 1-6. No React, no Next.js and no DB.

function variant(
  size: VariantSize,
  color: string,
  stockQty: number,
  priceOverrideCents: number | null = null,
): ProductDetailVariant {
  return {
    id: `${size}-${color}`,
    size,
    color,
    colorHex: color === "Camel" ? "#C19A6B" : "#3B4045",
    stockQty,
    priceOverrideCents,
  };
}

// Seeded overcoat shape: Camel S is out of stock.
const overcoat: ProductDetailVariant[] = [
  variant("S", "Camel", 0),
  variant("M", "Camel", 14),
  variant("L", "Camel", 9),
  variant("M", "Charcoal", 11),
  variant("L", "Charcoal", 6),
];

// Seeded blazer shape: XL / Navy overrides to $229.00.
const blazer: ProductDetailVariant[] = [
  variant("S", "Ivory", 8),
  variant("M", "Ivory", 12),
  variant("L", "Ivory", 5),
  variant("M", "Navy", 10),
  variant("XL", "Navy", 7, 22900),
];

describe("variant options", () => {
  it("derives distinct sizes in XS→XL order and colors alphabetically with swatches", () => {
    expect(getSizeOptions(overcoat)).toEqual(["S", "M", "L"]);
    expect(getColorOptions(overcoat)).toEqual([
      { color: "Camel", colorHex: "#C19A6B" },
      { color: "Charcoal", colorHex: "#3B4045" },
    ]);
    // Presentation order is independent of the input order.
    expect(getSizeOptions([...overcoat].reverse())).toEqual(["S", "M", "L"]);
  });

  it("treats a pair as selectable only when the exact variant has stock", () => {
    expect(isCombinationSelectable(overcoat, "M", "Camel")).toBe(true);
    expect(isCombinationSelectable(overcoat, "S", "Camel")).toBe(false);
    expect(isCombinationSelectable(overcoat, "S", "Charcoal")).toBe(false);
    expect(isCombinationSelectable(overcoat, "L", "Charcoal")).toBe(true);
  });
});

describe("selection transitions", () => {
  it("accepts a size that has an available variant before a color is chosen", () => {
    expect(selectSize(overcoat, {}, "M")).toEqual({ size: "M" });
  });

  it("rejects a size whose only variant is out of stock", () => {
    expect(selectSize(overcoat, {}, "S")).toEqual({});
  });

  it("accepts a color that has an available variant before a size is chosen", () => {
    expect(selectColor(overcoat, {}, "Camel")).toEqual({ color: "Camel" });
  });

  it("accepts only the exact available pair once the other dimension is chosen", () => {
    expect(selectSize(overcoat, { color: "Camel" }, "M")).toEqual({ size: "M", color: "Camel" });
    // S / Camel exists but has no stock; S / Charcoal is not offered.
    expect(selectSize(overcoat, { color: "Camel" }, "S")).toEqual({ color: "Camel" });
    expect(selectColor(overcoat, { size: "S" }, "Camel")).toEqual({ size: "S" });
    expect(selectColor(blazer, { size: "XL" }, "Navy")).toEqual({ size: "XL", color: "Navy" });
    expect(selectColor(blazer, { size: "XL" }, "Ivory")).toEqual({ size: "XL" });
  });
});

describe("price, variant and stock message", () => {
  it("falls back to the base price until a full variant is selected", () => {
    expect(getDisplayPriceCents(24900, undefined)).toBe(24900);
    expect(getSelectedVariant(blazer, { size: "XL" })).toBeUndefined();
  });

  it("returns the selected variant and its override price", () => {
    const selection = { size: "XL" as const, color: "Navy" };
    const selected = getSelectedVariant(blazer, selection);
    expect(selected?.priceOverrideCents).toBe(22900);
    expect(getDisplayPriceCents(24900, selected)).toBe(22900);
  });

  it("keeps the base price when the selected variant has no override", () => {
    const selected = getSelectedVariant(blazer, { size: "M", color: "Ivory" });
    expect(getDisplayPriceCents(24900, selected)).toBe(24900);
  });

  it("asks for the missing dimension with the exact copy", () => {
    expect(getStockMessage({}, undefined)).toBe(
      "Select a size and color to see availability.",
    );
    expect(getStockMessage({ size: "M" }, undefined)).toBe(
      "Select a color to see availability.",
    );
    expect(getStockMessage({ color: "Camel" }, undefined)).toBe(
      "Select a size to see availability.",
    );
  });

  it("reports available quantity, and out of stock defensively", () => {
    expect(getStockMessage({ size: "XL", color: "Navy" }, getSelectedVariant(blazer, { size: "XL", color: "Navy" }))).toBe(
      "In stock — 7 available.",
    );
    expect(getStockMessage({ size: "S", color: "Camel" }, getSelectedVariant(overcoat, { size: "S", color: "Camel" }))).toBe(
      "Out of stock.",
    );
    expect(getStockMessage({ size: "M", color: "Camel" }, undefined)).toBe("Out of stock.");
  });
});

describe("deep-link parsing", () => {
  it("restores a selectable pair and canonicalizes case", () => {
    expect(parseVariantSelection({ size: "XL", color: "Navy" }, blazer)).toEqual({
      size: "XL",
      color: "Navy",
    });
    expect(parseVariantSelection({ size: "xl", color: "navy" }, blazer)).toEqual({
      size: "XL",
      color: "Navy",
    });
    expect(parseVariantSelection({ size: "M", color: "ivory" }, blazer)).toEqual({
      size: "M",
      color: "Ivory",
    });
  });

  it("drops an out-of-stock pair entirely instead of keeping a half selection", () => {
    expect(parseVariantSelection({ size: "S", color: "Camel" }, overcoat)).toEqual({});
    expect(parseVariantSelection({ size: "S", color: "Charcoal" }, overcoat)).toEqual({});
  });

  it("ignores unknown values", () => {
    expect(parseVariantSelection({ size: "XXL", color: "Pink" }, overcoat)).toEqual({});
    expect(parseVariantSelection({ size: "M", color: "Pink" }, overcoat)).toEqual({ size: "M" });
    expect(parseVariantSelection({ size: "XXL", color: "Camel" }, overcoat)).toEqual({
      color: "Camel",
    });
    expect(parseVariantSelection({}, overcoat)).toEqual({});
  });

  it("keeps a single dimension only when it has an available variant", () => {
    expect(parseVariantSelection({ size: "M" }, overcoat)).toEqual({ size: "M" });
    expect(parseVariantSelection({ size: "S" }, overcoat)).toEqual({});
    expect(parseVariantSelection({ color: "Camel" }, overcoat)).toEqual({ color: "Camel" });
  });
});

describe("option states and accessible labels", () => {
  it("marks the size out of stock once its selected color has no stock", () => {
    expect(getSizeOptionState(overcoat, { color: "Camel" }, "S")).toBe("out_of_stock");
    expect(getSizeOptionState(overcoat, { color: "Camel" }, "M")).toBe("selectable");
    expect(getSizeOptionState(overcoat, { color: "Camel" }, "L")).toBe("selectable");
  });

  it("marks a pair that is not offered as unavailable in the other axis", () => {
    expect(getSizeOptionState(overcoat, { color: "Charcoal" }, "S")).toBe("unavailable");
    expect(getColorOptionState(blazer, { size: "XL" }, "Ivory")).toBe("unavailable");
  });

  it("disables S before any color is chosen because no S variant is available", () => {
    expect(getSizeOptionState(overcoat, {}, "S")).toBe("out_of_stock");
    expect(getSizeOptionState(overcoat, {}, "M")).toBe("selectable");
  });

  it("puts the disabled reason in the accessible name", () => {
    expect(getSizeOptionLabel("S", "out_of_stock", { color: "Camel" })).toBe(
      "S — Out of stock",
    );
    expect(getSizeOptionLabel("S", "unavailable", { color: "Charcoal" })).toBe(
      "S — Not available in Charcoal",
    );
    expect(getColorOptionLabel("Ivory", "unavailable", { size: "XL" })).toBe(
      "Ivory — Not available in size XL",
    );
    expect(getSizeOptionLabel("M", "selectable", {})).toBe("M");
  });
});

describe("URL building", () => {
  it("emits the canonical size/color query and the bare path when empty", () => {
    expect(buildVariantHref("/products/longline-wool-overcoat", {})).toBe(
      "/products/longline-wool-overcoat",
    );
    expect(
      buildVariantHref("/products/double-breasted-linen-blazer", {
        size: "XL",
        color: "Navy",
      }),
    ).toBe("/products/double-breasted-linen-blazer?size=XL&color=Navy");
    expect(buildVariantHref("/products/x", { color: "Sky Blue" })).toBe(
      "/products/x?color=Sky+Blue",
    );
  });
});
