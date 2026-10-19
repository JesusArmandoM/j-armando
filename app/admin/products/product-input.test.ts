import { describe, expect, it } from "vitest";

import {
  parsePriceDollarsToCents,
  resolveColorHex,
  validateAdminProductInput,
} from "./product-input.ts";

describe("parsePriceDollarsToCents", () => {
  it("converts USD dollar strings to integer cents without float drift", () => {
    expect(parsePriceDollarsToCents("249.00")).toBe(24900);
    expect(parsePriceDollarsToCents("249")).toBe(24900);
    expect(parsePriceDollarsToCents("$349.50")).toBe(34950);
    expect(parsePriceDollarsToCents("19.99")).toBe(1999);
    expect(parsePriceDollarsToCents("0.99")).toBe(99);
    expect(parsePriceDollarsToCents(129)).toBe(12900);
  });

  it("rejects zero, negative, or malformed dollar values", () => {
    expect(parsePriceDollarsToCents("0")).toBeNull();
    expect(parsePriceDollarsToCents("0.00")).toBeNull();
    expect(parsePriceDollarsToCents("-50.00")).toBeNull();
    expect(parsePriceDollarsToCents("249.999")).toBeNull();
    expect(parsePriceDollarsToCents("abc")).toBeNull();
    expect(parsePriceDollarsToCents("")).toBeNull();
    expect(parsePriceDollarsToCents(null)).toBeNull();
  });
});

describe("resolveColorHex", () => {
  it("returns valid hex codes and resolves known color names when hex is omitted", () => {
    expect(resolveColorHex("#36383a", "Custom")).toBe("#36383a");
    expect(resolveColorHex("", "Navy")).toBe("#1b2838");
    expect(resolveColorHex(undefined, "Unknown Shade")).toBe("#121212");
    expect(resolveColorHex("not-a-hex", "Black")).toBeNull();
  });
});

describe("validateAdminProductInput", () => {
  const validPayload = {
    name: "Structured Wool Blazer",
    categoryId: "11111111-1111-4111-8111-111111111111",
    basePriceDollars: "289.00",
    description: "Single-breasted blazer tailored in lightweight Italian wool.",
    composition: "100% Virgin Wool",
    care: "Dry clean only.",
    imageUrl: "/images/products/structured-wool-blazer-1.svg",
    variants: [
      { size: "S", color: "Black", colorHex: "#121212", stockQty: "12" },
      { size: "M", color: "Black", colorHex: "#121212", stockQty: 8 },
    ],
  };

  it("validates a complete product payload with two variants and per-variant stock", () => {
    const result = validateAdminProductInput(validPayload);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid input");

    expect(result.data.name).toBe("Structured Wool Blazer");
    expect(result.data.basePriceCents).toBe(28900);
    expect(result.data.variants).toHaveLength(2);
    expect(result.data.variants[0]).toEqual({
      size: "S",
      color: "Black",
      colorHex: "#121212",
      stockQty: 12,
      priceOverrideCents: null,
    });
    expect(result.data.variants[1]).toEqual({
      size: "M",
      color: "Black",
      colorHex: "#121212",
      stockQty: 8,
      priceOverrideCents: null,
    });
  });

  it("rejects missing required fields with clear field error messages", () => {
    const result = validateAdminProductInput({
      name: " ",
      categoryId: "",
      basePriceDollars: "-10",
      description: "",
      composition: "",
      care: "",
      variants: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid result");
    expect(result.fieldErrors.name).toBe("Product name is required.");
    expect(result.fieldErrors.categoryId).toBe("Category is required.");
    expect(result.fieldErrors.basePrice).toContain("valid positive USD price");
    expect(result.fieldErrors.description).toBe("Description is required.");
    expect(result.fieldErrors.composition).toBe("Composition / material is required.");
    expect(result.fieldErrors.care).toBe("Care instructions are required.");
    expect(result.fieldErrors.variants).toBe(
      "At least one variant (size and color) is required.",
    );
  });

  it("rejects duplicate (size, color) variant combinations and negative stock", () => {
    const result = validateAdminProductInput({
      ...validPayload,
      variants: [
        { size: "M", color: "Charcoal", stockQty: 5 },
        { size: "M", color: "charcoal", stockQty: -2 },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid result");
    expect(result.fieldErrors["variants.1.color"]).toContain(
      "Duplicate variant combination",
    );
    expect(result.fieldErrors["variants.1.stockQty"]).toContain(
      "stock must be a whole number of 0 or greater",
    );
  });

  it("rejects invalid garment sizes", () => {
    const result = validateAdminProductInput({
      ...validPayload,
      variants: [{ size: "XXL", color: "Black", stockQty: 4 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid result");
    expect(result.fieldErrors["variants.0.size"]).toContain(
      "size must be one of XS, S, M, L, XL",
    );
  });
});
