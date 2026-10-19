import type { SizeChartEntry } from "@/db/catalog.ts";
import type { SizeChartMeasurements, VariantSize } from "@/db/schema/index.ts";

const MEASUREMENT_ORDER = [
  "chest",
  "waist",
  "hip",
  "sleeve",
  "length",
  "inseam",
  "rise",
] as const;

type MeasurementKey = (typeof MEASUREMENT_ORDER)[number];

const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  chest: "Chest / bust",
  waist: "Waist",
  hip: "Hip",
  sleeve: "Sleeve",
  length: "Length",
  inseam: "Inseam",
  rise: "Rise",
};

interface SizeGuideProps {
  rows: readonly SizeChartEntry[];
  /** Sizes actually offered for this product; discontinued sizes are excluded. */
  availableSizes: readonly VariantSize[];
}

/**
 * Published, category-level body measurements for the sizes this product
 * offers. Measurements are approximate inches and are never generated in the
 * UI; the product page and the chat read the same `size_chart` rows.
 */
export function SizeGuide({ rows, availableSizes }: SizeGuideProps) {
  const sizes = new Set<string>(availableSizes);
  const visibleRows = rows.filter((row) => sizes.has(row.size));
  const columns = MEASUREMENT_ORDER.filter((key) =>
    visibleRows.some((row) => row.measurements[key] !== undefined),
  );

  if (visibleRows.length === 0 || columns.length === 0) {
    return null;
  }

  return (
    <details className="product-detail__size-guide" data-testid="size-guide" open>
      <summary className="product-detail__size-guide-summary">Size guide</summary>
      <p className="product-detail__size-guide-note">
        Approximate body measurements in inches. If you are between sizes, contact the store.
      </p>
      <div className="product-detail__size-guide-table-wrap">
        <table className="product-detail__size-guide-table" data-testid="size-guide-table">
          <thead>
            <tr>
              <th scope="col">Size</th>
              {columns.map((key) => (
                <th scope="col" key={key}>
                  {MEASUREMENT_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.size}>
                <th scope="row">{row.size}</th>
                {columns.map((key) => {
                  const measurement: SizeChartMeasurements[MeasurementKey] =
                    row.measurements[key];
                  return (
                    <td key={key}>
                      {measurement ? `${measurement.min}–${measurement.max}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
