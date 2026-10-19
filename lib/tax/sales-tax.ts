// US Sales Tax calculation module (CONTEXT.md -> Sales Tax, CONSTRAINTS.md rule 1).
// All money values are handled in integer cents.
// Sales tax is calculated from the shipping address destination US state code.
// Rates follow state baseline sales tax rules; unlisted states fall back to 5% (0.05).
// States with no state sales tax (AK, DE, MT, NH, OR) map to 0.00.

export const STATE_TAX_RATES: Record<string, number> = {
  AL: 0.04,
  AK: 0.00,
  AZ: 0.056,
  AR: 0.065,
  CA: 0.0725,
  CO: 0.029,
  CT: 0.0635,
  DE: 0.00,
  DC: 0.06,
  FL: 0.06,
  GA: 0.04,
  HI: 0.04,
  ID: 0.06,
  IL: 0.0625,
  IN: 0.07,
  IA: 0.06,
  KS: 0.065,
  KY: 0.06,
  LA: 0.0445,
  ME: 0.055,
  MD: 0.06,
  MA: 0.0625,
  MI: 0.06,
  MN: 0.06875,
  MS: 0.07,
  MO: 0.04225,
  MT: 0.00,
  NE: 0.055,
  NV: 0.0685,
  NH: 0.00,
  NJ: 0.06625,
  NM: 0.05125,
  NY: 0.08,
  NC: 0.0475,
  ND: 0.05,
  OH: 0.0575,
  OK: 0.045,
  OR: 0.00,
  PA: 0.06,
  RI: 0.07,
  SC: 0.06,
  SD: 0.042,
  TN: 0.07,
  TX: 0.0625,
  UT: 0.061,
  VT: 0.06,
  VA: 0.053,
  WA: 0.065,
  WV: 0.06,
  WI: 0.05,
  WY: 0.04,
};

export const DEFAULT_TAX_RATE = 0.05;

export interface SalesTaxCalculation {
  rate: number;
  taxCents: number;
}

/**
 * Calculates sales tax in integer cents based on subtotal in cents and destination US state code.
 *
 * If stateCode is null, undefined, or empty, returns { rate: 0, taxCents: 0 }.
 * Subtotal <= 0 returns { rate, taxCents: 0 }.
 * Tax is rounded to the nearest integer cent via Math.round.
 */
export function calculateSalesTax(
  subtotalCents: number,
  stateCode?: string | null,
): SalesTaxCalculation {
  if (!stateCode || typeof stateCode !== "string") {
    return { rate: 0, taxCents: 0 };
  }

  const normalized = stateCode.trim().toUpperCase();
  if (!normalized) {
    return { rate: 0, taxCents: 0 };
  }

  const rate = Object.prototype.hasOwnProperty.call(STATE_TAX_RATES, normalized)
    ? STATE_TAX_RATES[normalized]
    : DEFAULT_TAX_RATE;

  if (subtotalCents <= 0) {
    return { rate, taxCents: 0 };
  }

  const taxCents = Math.round(subtotalCents * rate);
  return { rate, taxCents };
}
