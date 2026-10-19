import { count } from "drizzle-orm";

import { closeDb, getHandle } from "./client.ts";
import type { Db } from "./client.ts";
import { isMainModule } from "./main.ts";
import { category, product, shippingMethod, sizeChart, variant } from "./schema/index.ts";
import type { ProductStatus } from "./schema/index.ts";

// `pnpm db:verify` — asserts the catalog is populated after `pnpm db:seed`
// (spec: bootstrap-database-schema, scenario 6). Exits 0 when the catalog
// holds at least the expected counts and all three product statuses; exits 1
// on an empty or partially seeded catalog.

export interface CatalogCounts {
  categories: number;
  products: number;
  variants: number;
  sizeCharts: number;
  shippingMethods: number;
  productsByStatus: Record<ProductStatus, number>;
}

export interface CatalogVerification {
  ok: boolean;
  problems: string[];
  counts: CatalogCounts;
}

// Expected counts are the demo catalog's seeded baseline (db/seed-data.ts)
// applied as minimums: the seed is non-destructive, so rows may have been
// edited or added afterwards and verification must not fail on that. An empty
// or partially seeded catalog always fails.
export const EXPECTED_MIN_CATEGORIES = 6;
export const EXPECTED_MIN_PRODUCTS = 9;
export const EXPECTED_MIN_VARIANTS = 24;
export const EXPECTED_MIN_SIZE_CHARTS = 30;
export const EXPECTED_MIN_SHIPPING_METHODS = 2;
export const REQUIRED_PRODUCT_STATUSES: readonly ProductStatus[] = [
  "published",
  "draft",
  "archived",
];

export async function readCatalogCounts(db: Db): Promise<CatalogCounts> {
  const [categoryCount] = await db.select({ n: count() }).from(category);
  const [productCount] = await db.select({ n: count() }).from(product);
  const [variantCount] = await db.select({ n: count() }).from(variant);
  const [sizeChartCount] = await db.select({ n: count() }).from(sizeChart);
  const [shippingMethodCount] = await db.select({ n: count() }).from(shippingMethod);

  const statusRows = await db
    .select({ status: product.status, n: count() })
    .from(product)
    .groupBy(product.status);
  const productsByStatus: Record<ProductStatus, number> = {
    draft: 0,
    published: 0,
    archived: 0,
  };
  for (const row of statusRows) {
    productsByStatus[row.status] = row.n;
  }

  return {
    categories: categoryCount.n,
    products: productCount.n,
    variants: variantCount.n,
    sizeCharts: sizeChartCount.n,
    shippingMethods: shippingMethodCount.n,
    productsByStatus,
  };
}

export async function verifyCatalog(db: Db): Promise<CatalogVerification> {
  const counts = await readCatalogCounts(db);
  const problems: string[] = [];

  if (counts.categories < EXPECTED_MIN_CATEGORIES) {
    problems.push(
      `expected at least ${EXPECTED_MIN_CATEGORIES} categories, found ${counts.categories}`,
    );
  }
  if (counts.products < EXPECTED_MIN_PRODUCTS) {
    problems.push(`expected at least ${EXPECTED_MIN_PRODUCTS} products, found ${counts.products}`);
  }
  if (counts.variants < EXPECTED_MIN_VARIANTS) {
    problems.push(`expected at least ${EXPECTED_MIN_VARIANTS} variants, found ${counts.variants}`);
  }
  if (counts.sizeCharts < EXPECTED_MIN_SIZE_CHARTS) {
    problems.push(
      `expected at least ${EXPECTED_MIN_SIZE_CHARTS} size-chart rows, found ${counts.sizeCharts}`,
    );
  }
  if (counts.shippingMethods < EXPECTED_MIN_SHIPPING_METHODS) {
    problems.push(
      `expected at least ${EXPECTED_MIN_SHIPPING_METHODS} shipping methods, found ${counts.shippingMethods}`,
    );
  }
  for (const status of REQUIRED_PRODUCT_STATUSES) {
    if (counts.productsByStatus[status] < 1) {
      problems.push(`expected at least one product with status '${status}', found none`);
    }
  }

  return { ok: problems.length === 0, problems, counts };
}

function formatCounts(counts: CatalogCounts): string[] {
  return [
    `categories: ${counts.categories}`,
    `products:   ${counts.products} (published: ${counts.productsByStatus.published}, draft: ${counts.productsByStatus.draft}, archived: ${counts.productsByStatus.archived})`,
    `variants:   ${counts.variants}`,
    `size charts: ${counts.sizeCharts}`,
    `shipping methods: ${counts.shippingMethods}`,
  ];
}

if (isMainModule(import.meta.url)) {
  const { db } = getHandle();
  try {
    const result = await verifyCatalog(db);
    console.log("Catalog verification:");
    for (const line of formatCounts(result.counts)) {
      console.log(`  ${line}`);
    }
    if (result.ok) {
      console.log(
        `OK: catalog is populated (at least ${EXPECTED_MIN_CATEGORIES} categories, ${EXPECTED_MIN_PRODUCTS} products, ${EXPECTED_MIN_VARIANTS} variants, ${EXPECTED_MIN_SIZE_CHARTS} size-chart rows, ${EXPECTED_MIN_SHIPPING_METHODS} shipping methods; statuses ${REQUIRED_PRODUCT_STATUSES.join(", ")} present).`,
      );
    } else {
      console.error("FAILED: catalog is not populated:");
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}
