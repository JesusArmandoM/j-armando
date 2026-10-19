import { describe, expect, it } from "vitest";

import {
  MAX_ADD_QUANTITY,
  isVariantIdShape,
  parseAddToCartBody,
  parseRemoveCartLineBody,
  parseUpdateCartLineBody,
} from "./cart-input";

const VALID_VARIANT_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_LINE_ID = "987fcdeb-51a2-43d7-9876-543210fedcba";

describe("cart add input", () => {
  it("accepts a canonical uuid-shaped variant id and an integer quantity from 1 to 10", () => {
    expect(parseAddToCartBody({ variantId: VALID_VARIANT_ID, quantity: 2 })).toEqual({
      ok: true,
      value: { variantId: VALID_VARIANT_ID, quantity: 2 },
    });
    expect(parseAddToCartBody({ variantId: VALID_VARIANT_ID, quantity: 1 }).ok).toBe(true);
    expect(
      parseAddToCartBody({ variantId: VALID_VARIANT_ID, quantity: MAX_ADD_QUANTITY }).ok,
    ).toBe(true);
    expect(parseAddToCartBody({ variantId: VALID_VARIANT_ID.toUpperCase(), quantity: 1 }).ok).toBe(
      true,
    );
    expect(parseAddToCartBody({ variantId: ` ${VALID_VARIANT_ID} `, quantity: 1 })).toEqual({
      ok: true,
      value: { variantId: VALID_VARIANT_ID, quantity: 1 },
    });
  });

  it("rejects malformed bodies without reading extra fields", () => {
    for (const body of [null, undefined, "text", 42, [], { quantity: 1 }, { variantId: "x" }]) {
      expect(parseAddToCartBody(body).ok).toBe(false);
    }

    // A valid body can carry extra properties, but they are not returned.
    const parsed = parseAddToCartBody({
      variantId: VALID_VARIANT_ID,
      quantity: 1,
      priceCents: 1,
      cartId: "attacker-cart",
    });
    expect(parsed).toEqual({
      ok: true,
      value: { variantId: VALID_VARIANT_ID, quantity: 1 },
    });
  });

  it("rejects variant ids that are not the 8-4-4-4-12 hexadecimal shape", () => {
    for (const value of [
      "",
      "not-a-uuid",
      "123e4567e89b12d3a456426614174000",
      "123e4567-e89b-12d3-a456-42661417400",
      "123e4567-e89b-12d3-a456-4266141740000",
      "123e4567-e89b-12d3-a456-42661417400g",
      "{123e4567-e89b-12d3-a456-426614174000}",
    ]) {
      expect(isVariantIdShape(value)).toBe(false);
      expect(parseAddToCartBody({ variantId: value, quantity: 1 }).ok).toBe(false);
    }
  });

  it("rejects non-integer, out-of-range and non-number quantities", () => {
    for (const quantity of [0, -1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2", null, true]) {
      expect(parseAddToCartBody({ variantId: VALID_VARIANT_ID, quantity }).ok).toBe(false);
    }

    const result = parseAddToCartBody({ variantId: VALID_VARIANT_ID, quantity: 0 });
    expect(result).toEqual({
      ok: false,
      error: `Quantity must be a whole number from 1 to ${MAX_ADD_QUANTITY}.`,
    });
  });
});

describe("cart update input", () => {
  it("accepts a canonical uuid-shaped lineId and quantity from 1 to 10", () => {
    expect(parseUpdateCartLineBody({ lineId: VALID_LINE_ID, quantity: 3 })).toEqual({
      ok: true,
      value: { lineId: VALID_LINE_ID, quantity: 3 },
    });
  });

  it("rejects non-uuid lineId and invalid quantity", () => {
    expect(parseUpdateCartLineBody({ lineId: "invalid", quantity: 3 }).ok).toBe(false);
    expect(parseUpdateCartLineBody({ lineId: VALID_LINE_ID, quantity: 0 }).ok).toBe(false);
    expect(parseUpdateCartLineBody({ lineId: VALID_LINE_ID, quantity: 11 }).ok).toBe(false);
    expect(parseUpdateCartLineBody(null).ok).toBe(false);
  });
});

describe("cart remove input", () => {
  it("accepts a canonical uuid-shaped lineId", () => {
    expect(parseRemoveCartLineBody({ lineId: VALID_LINE_ID })).toEqual({
      ok: true,
      value: { lineId: VALID_LINE_ID },
    });
  });

  it("rejects non-uuid lineId or invalid bodies", () => {
    expect(parseRemoveCartLineBody({ lineId: "invalid" }).ok).toBe(false);
    expect(parseRemoveCartLineBody({}).ok).toBe(false);
    expect(parseRemoveCartLineBody(null).ok).toBe(false);
  });
});

