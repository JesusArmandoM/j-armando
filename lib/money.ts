// Framework-agnostic money formatting. Money is integer cents in USD
// (CONSTRAINTS.md rule 1): the amount is carried as an integer number of cents
// and only converted to a decimal string for display — no float value is stored
// or compared.
//
// This module imports no `next`/`react`/`db`/network code so both the data layer
// (`db/catalog.ts`) and the framework-agnostic payment mapper
// (`payments/payment-outcome.ts`) can share one formatter.

/** Formats integer cents into a USD currency string (e.g. 24900 -> "$249.00"). */
export function formatPriceUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
