import { describe, expect, it } from "vitest";

import {
  calculateSalesTax,
  DEFAULT_TAX_RATE,
  STATE_TAX_RATES,
} from "./sales-tax.ts";

describe("calculateSalesTax", () => {
  it("returns 0 rate and 0 taxCents when stateCode is null, undefined, or empty", () => {
    expect(calculateSalesTax(24900, null)).toEqual({ rate: 0, taxCents: 0 });
    expect(calculateSalesTax(24900, undefined)).toEqual({ rate: 0, taxCents: 0 });
    expect(calculateSalesTax(24900, "")).toEqual({ rate: 0, taxCents: 0 });
    expect(calculateSalesTax(24900, "   ")).toEqual({ rate: 0, taxCents: 0 });
  });

  it("returns 0 tax for states with no sales tax (OR, NH, MT, DE, AK)", () => {
    const noTaxStates = ["OR", "NH", "MT", "DE", "AK"];
    for (const state of noTaxStates) {
      const result = calculateSalesTax(24900, state);
      expect(result.rate).toBe(0.0);
      expect(result.taxCents).toBe(0);
    }
  });

  it("calculates sales tax correctly for major US states with integer rounding", () => {
    // NY: 8.0% -> 24900 * 0.08 = 1992
    const ny = calculateSalesTax(24900, "NY");
    expect(ny.rate).toBe(0.08);
    expect(ny.taxCents).toBe(1992);
    expect(Number.isInteger(ny.taxCents)).toBe(true);

    // CA: 7.25% -> 24900 * 0.0725 = 1805.25 -> Math.round -> 1805
    const ca = calculateSalesTax(24900, "CA");
    expect(ca.rate).toBe(0.0725);
    expect(ca.taxCents).toBe(1805);
    expect(Number.isInteger(ca.taxCents)).toBe(true);

    // TX: 6.25% -> 24900 * 0.0625 = 1556.25 -> 1556
    const tx = calculateSalesTax(24900, "TX");
    expect(tx.rate).toBe(0.0625);
    expect(tx.taxCents).toBe(1556);

    // FL: 6.0% -> 24900 * 0.06 = 1494
    const fl = calculateSalesTax(24900, "FL");
    expect(fl.rate).toBe(0.06);
    expect(fl.taxCents).toBe(1494);

    // WA: 6.5% -> 24900 * 0.065 = 1618.5 -> Math.round -> 1619
    const wa = calculateSalesTax(24900, "WA");
    expect(wa.rate).toBe(0.065);
    expect(wa.taxCents).toBe(1619);

    // IL: 6.25% -> 24900 * 0.0625 = 1556.25 -> 1556
    const il = calculateSalesTax(24900, "IL");
    expect(il.rate).toBe(0.0625);
    expect(il.taxCents).toBe(1556);

    // PA: 6.0% -> 24900 * 0.06 = 1494
    const pa = calculateSalesTax(24900, "PA");
    expect(pa.rate).toBe(0.06);
    expect(pa.taxCents).toBe(1494);
  });

  it("handles case-insensitivity and whitespace", () => {
    expect(calculateSalesTax(24900, "ny")).toEqual({ rate: 0.08, taxCents: 1992 });
    expect(calculateSalesTax(24900, "  ca  ")).toEqual({ rate: 0.0725, taxCents: 1805 });
    expect(calculateSalesTax(24900, "Or")).toEqual({ rate: 0.0, taxCents: 0 });
  });

  it("applies fallback rate (5%) for unlisted state codes", () => {
    const unknown = calculateSalesTax(20000, "ZZ");
    expect(unknown.rate).toBe(DEFAULT_TAX_RATE);
    expect(unknown.taxCents).toBe(1000); // 20000 * 0.05 = 1000
  });

  it("returns 0 tax cents when subtotal is 0 or negative", () => {
    expect(calculateSalesTax(0, "NY")).toEqual({ rate: 0.08, taxCents: 0 });
    expect(calculateSalesTax(-500, "CA")).toEqual({ rate: 0.0725, taxCents: 0 });
  });

  it("verifies all registered state tax rates are non-negative numbers", () => {
    for (const [code, rate] of Object.entries(STATE_TAX_RATES)) {
      expect(code).toHaveLength(2);
      expect(typeof rate).toBe("number");
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThan(0.15); // sanity check: US state sales tax is < 15%
    }
  });
});
