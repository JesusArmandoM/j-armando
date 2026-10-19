import type { SizeChartMeasurements } from "./schema/catalog.ts";
import type { AccountRoleName, ProductStatus, VariantSize } from "./schema/enums.ts";

// Declarative demo catalog content for `pnpm db:seed` (spec:
// `bootstrap-database-schema` → seed inventory). English copy, US market,
// USD tax-exclusive prices stored as integer cents. The loader in seed.ts is
// insert-if-missing: nothing in this file is ever applied over existing rows.

export interface SeedCategory {
  slug: string;
  name: string;
  sortOrder: number;
}

export interface SeedProductImage {
  /** Public path under public/images/products/ (placeholder SVGs). */
  path: string;
  altText: string;
  position: number;
}

export interface SeedVariant {
  size: VariantSize;
  /** English color name (CONTEXT.md). */
  color: string;
  /** Swatch hex value shown to shoppers. */
  colorHex: string;
  sku: string;
  /** Overrides the product base price when set, in integer cents. */
  priceOverrideCents?: number;
  stockQty: number;
}

export interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  composition: string;
  care: string;
  /** Tax-exclusive base price in integer cents ($89–$349). */
  basePriceCents: number;
  categorySlug: string;
  /** Draft/published/archived coverage is required by catalog-product-listing. */
  status: ProductStatus;
  images: SeedProductImage[];
  variants: SeedVariant[];
}

export const seedCategories: SeedCategory[] = [
  { slug: "coats", name: "Coats", sortOrder: 1 },
  { slug: "blazers", name: "Blazers", sortOrder: 2 },
  { slug: "dresses", name: "Dresses", sortOrder: 3 },
  { slug: "knitwear", name: "Knitwear", sortOrder: 4 },
  { slug: "shirts", name: "Shirts", sortOrder: 5 },
  { slug: "trousers", name: "Trousers", sortOrder: 6 },
];

export interface SeedSizeChart {
  categorySlug: string;
  size: VariantSize;
  /** Approximate body measurements in inches. */
  measurements: SizeChartMeasurements;
}

/** Standard US women's body measurements used across the demo catalog. */
const SIZE_CHART_SIZES: readonly VariantSize[] = ["XS", "S", "M", "L", "XL"];

type ChartSet = {
  chest?: SizeChartMeasurements["chest"];
  waist?: SizeChartMeasurements["waist"];
  hip?: SizeChartMeasurements["hip"];
  sleeve?: SizeChartMeasurements["sleeve"];
  length?: SizeChartMeasurements["length"];
  inseam?: SizeChartMeasurements["inseam"];
  rise?: SizeChartMeasurements["rise"];
};

function range(min: number, max: number) {
  return { min, max };
}

const TOPS: Record<VariantSize, ChartSet> = {
  XS: { chest: range(31, 32), waist: range(24, 25), hip: range(34, 35), sleeve: range(30, 31) },
  S: { chest: range(33, 34), waist: range(26, 27), hip: range(36, 37), sleeve: range(31, 32) },
  M: { chest: range(35, 36), waist: range(28, 29), hip: range(38, 39), sleeve: range(32, 33) },
  L: { chest: range(37, 39), waist: range(30, 32), hip: range(40, 42), sleeve: range(33, 34) },
  XL: { chest: range(40, 42), waist: range(33, 35), hip: range(43, 45), sleeve: range(34, 35) },
};

const DRESSES: Record<VariantSize, ChartSet> = {
  XS: { ...TOPS.XS, length: range(43, 44) },
  S: { ...TOPS.S, length: range(44, 45) },
  M: { ...TOPS.M, length: range(45, 46) },
  L: { ...TOPS.L, length: range(46, 47) },
  XL: { ...TOPS.XL, length: range(47, 48) },
};

const TROUSERS: Record<VariantSize, ChartSet> = {
  XS: { waist: range(24, 25), hip: range(34, 35), inseam: range(30, 31), rise: range(9, 10) },
  S: { waist: range(26, 27), hip: range(36, 37), inseam: range(30, 31), rise: range(10, 11) },
  M: { waist: range(28, 29), hip: range(38, 39), inseam: range(31, 32), rise: range(10, 11) },
  L: { waist: range(30, 32), hip: range(40, 42), inseam: range(31, 32), rise: range(11, 12) },
  XL: { waist: range(33, 35), hip: range(43, 45), inseam: range(32, 33), rise: range(11, 12) },
};

function sizeChartRows(
  categorySlug: string,
  measurementsBySize: Record<VariantSize, ChartSet>,
): SeedSizeChart[] {
  return SIZE_CHART_SIZES.map((size) => ({
    categorySlug,
    size,
    measurements: measurementsBySize[size],
  }));
}

export const seedSizeCharts: SeedSizeChart[] = [
  ...sizeChartRows("coats", TOPS),
  ...sizeChartRows("blazers", TOPS),
  ...sizeChartRows("dresses", DRESSES),
  ...sizeChartRows("knitwear", TOPS),
  ...sizeChartRows("shirts", TOPS),
  ...sizeChartRows("trousers", TROUSERS),
];

export interface SeedShippingMethod {
  slug: string;
  name: string;
  description: string;
  /** Shipping cost in integer cents. */
  costCents: number;
  deliveryEstimate: string;
}

export const seedShippingMethods: SeedShippingMethod[] = [
  {
    slug: "standard",
    name: "Standard Shipping",
    description: "Free standard shipping across the United States.",
    costCents: 0,
    deliveryEstimate: "3–5 business days",
  },
  {
    slug: "express",
    name: "Express Shipping",
    description: "Flat-rate express shipping across the United States.",
    costCents: 1500,
    deliveryEstimate: "1–2 business days",
  },
];

export const seedProducts: SeedProduct[] = [
  {
    slug: "longline-wool-overcoat",
    name: "Longline Wool Overcoat",
    description:
      "A full-length overcoat cut from a soft wool blend, with a relaxed shoulder, notch lapel and a single back vent. Fully lined for layering over tailoring and knitwear.",
    composition: "Shell: 70% wool, 20% polyester, 10% cashmere. Lining: 100% viscose.",
    care: "Dry clean only. Steam to refresh and store on a wide hanger.",
    basePriceCents: 34900,
    categorySlug: "coats",
    status: "published",
    images: [
      {
        path: "/images/products/longline-wool-overcoat-1.svg",
        altText: "Longline Wool Overcoat in Camel, front view",
        position: 1,
      },
      {
        path: "/images/products/longline-wool-overcoat-2.svg",
        altText: "Longline Wool Overcoat in Camel, back view",
        position: 2,
      },
      {
        path: "/images/products/longline-wool-overcoat-3.svg",
        altText: "Longline Wool Overcoat fabric detail",
        position: 3,
      },
    ],
    variants: [
      { size: "S", color: "Camel", colorHex: "#C19A6B", sku: "JA-OWO-CML-S", stockQty: 0 },
      { size: "M", color: "Camel", colorHex: "#C19A6B", sku: "JA-OWO-CML-M", stockQty: 14 },
      { size: "L", color: "Camel", colorHex: "#C19A6B", sku: "JA-OWO-CML-L", stockQty: 9 },
      { size: "M", color: "Charcoal", colorHex: "#3B4045", sku: "JA-OWO-CHR-M", stockQty: 11 },
      { size: "L", color: "Charcoal", colorHex: "#3B4045", sku: "JA-OWO-CHR-L", stockQty: 6 },
    ],
  },
  {
    slug: "double-breasted-linen-blazer",
    name: "Double-Breasted Linen Blazer",
    description:
      "An unstructured double-breasted blazer in breathable linen, tailored with a peak lapel, patch pockets and a half lining for warm-weather wear.",
    composition: "Shell: 100% linen. Lining: 100% viscose.",
    care: "Dry clean only. Hang to release creases and avoid prolonged direct sunlight.",
    basePriceCents: 24900,
    categorySlug: "blazers",
    status: "published",
    images: [
      {
        path: "/images/products/double-breasted-linen-blazer-1.svg",
        altText: "Double-Breasted Linen Blazer in Ivory, front view",
        position: 1,
      },
      {
        path: "/images/products/double-breasted-linen-blazer-2.svg",
        altText: "Double-Breasted Linen Blazer in Ivory, side view",
        position: 2,
      },
      {
        path: "/images/products/double-breasted-linen-blazer-3.svg",
        altText: "Double-Breasted Linen Blazer lapel detail",
        position: 3,
      },
    ],
    variants: [
      { size: "S", color: "Ivory", colorHex: "#F3EDE2", sku: "JA-DBB-IVY-S", stockQty: 8 },
      { size: "M", color: "Ivory", colorHex: "#F3EDE2", sku: "JA-DBB-IVY-M", stockQty: 12 },
      { size: "L", color: "Ivory", colorHex: "#F3EDE2", sku: "JA-DBB-IVY-L", stockQty: 5 },
      { size: "M", color: "Navy", colorHex: "#22304A", sku: "JA-DBB-NVY-M", stockQty: 10 },
      {
        size: "XL",
        color: "Navy",
        colorHex: "#22304A",
        sku: "JA-DBB-NVY-XL",
        stockQty: 7,
        // Reduced-price last sizes drive the price-override selection UI.
        priceOverrideCents: 22900,
      },
    ],
  },
  {
    slug: "silk-slip-midi-dress",
    name: "Silk Slip Midi Dress",
    description:
      "A bias-cut midi dress in washed silk with adjustable straps, a cowl neckline and a fluid skirt that skims the body.",
    composition: "100% silk.",
    care: "Dry clean or hand wash cold. Do not tumble dry; cool iron on reverse.",
    basePriceCents: 18900,
    categorySlug: "dresses",
    status: "published",
    images: [
      {
        path: "/images/products/silk-slip-midi-dress-1.svg",
        altText: "Silk Slip Midi Dress in Black, front view",
        position: 1,
      },
      {
        path: "/images/products/silk-slip-midi-dress-2.svg",
        altText: "Silk Slip Midi Dress in Burgundy, back view",
        position: 2,
      },
    ],
    variants: [
      { size: "XS", color: "Black", colorHex: "#1A1A1A", sku: "JA-SSM-BLK-XS", stockQty: 6 },
      { size: "S", color: "Black", colorHex: "#1A1A1A", sku: "JA-SSM-BLK-S", stockQty: 10 },
      { size: "M", color: "Black", colorHex: "#1A1A1A", sku: "JA-SSM-BLK-M", stockQty: 7 },
      { size: "S", color: "Burgundy", colorHex: "#6E1E2B", sku: "JA-SSM-BUR-S", stockQty: 4 },
      { size: "M", color: "Burgundy", colorHex: "#6E1E2B", sku: "JA-SSM-BUR-M", stockQty: 8 },
    ],
  },
  {
    slug: "merino-crewneck-sweater",
    name: "Merino Crewneck Sweater",
    description:
      "A fine-gauge crewneck in extra-fine merino, ribbed at the collar, cuffs and hem. Lightweight enough to layer under tailoring.",
    composition: "100% extra-fine merino wool.",
    care: "Hand wash cold with wool detergent. Dry flat; do not wring.",
    basePriceCents: 12900,
    categorySlug: "knitwear",
    status: "published",
    images: [
      {
        path: "/images/products/merino-crewneck-sweater-1.svg",
        altText: "Merino Crewneck Sweater in Cream, front view",
        position: 1,
      },
      {
        path: "/images/products/merino-crewneck-sweater-2.svg",
        altText: "Merino Crewneck Sweater in Olive, folded",
        position: 2,
      },
    ],
    variants: [
      { size: "S", color: "Cream", colorHex: "#F1E7D4", sku: "JA-MCS-CRM-S", stockQty: 15 },
      { size: "M", color: "Cream", colorHex: "#F1E7D4", sku: "JA-MCS-CRM-M", stockQty: 18 },
      { size: "L", color: "Cream", colorHex: "#F1E7D4", sku: "JA-MCS-CRM-L", stockQty: 12 },
      { size: "M", color: "Olive", colorHex: "#75754F", sku: "JA-MCS-OLV-M", stockQty: 9 },
      {
        size: "L",
        color: "Olive",
        colorHex: "#75754F",
        sku: "JA-MCS-OLV-L",
        stockQty: 6,
        priceOverrideCents: 11900,
      },
    ],
  },
  {
    slug: "cotton-poplin-shirt",
    name: "Cotton Poplin Shirt",
    description:
      "A crisp button-down shirt in compact cotton poplin, with a spread collar, mother-of-pearl buttons and a curved shirttail hem.",
    composition: "100% cotton.",
    care: "Machine wash cold on a gentle cycle. Hang to dry and warm iron.",
    basePriceCents: 8900,
    categorySlug: "shirts",
    status: "published",
    images: [
      {
        path: "/images/products/cotton-poplin-shirt-1.svg",
        altText: "Cotton Poplin Shirt in White, front view",
        position: 1,
      },
    ],
    variants: [
      { size: "S", color: "White", colorHex: "#F7F7F5", sku: "JA-CPS-WHT-S", stockQty: 20 },
      { size: "M", color: "White", colorHex: "#F7F7F5", sku: "JA-CPS-WHT-M", stockQty: 24 },
      { size: "L", color: "White", colorHex: "#F7F7F5", sku: "JA-CPS-WHT-L", stockQty: 16 },
      { size: "M", color: "Sky Blue", colorHex: "#A9C3D9", sku: "JA-CPS-SKY-M", stockQty: 13 },
      { size: "L", color: "Sky Blue", colorHex: "#A9C3D9", sku: "JA-CPS-SKY-L", stockQty: 10 },
    ],
  },
  {
    slug: "pleated-wool-trousers",
    name: "Pleated Wool Trousers",
    description:
      "Single-pleat trousers in mid-weight wool with a high rise, tapered leg and an unfinished hem ready for tailoring.",
    composition: "100% wool.",
    care: "Dry clean only. Press with a cloth and hang by the cuff.",
    basePriceCents: 15900,
    categorySlug: "trousers",
    status: "published",
    images: [
      {
        path: "/images/products/pleated-wool-trousers-1.svg",
        altText: "Pleated Wool Trousers in Charcoal, front view",
        position: 1,
      },
      {
        path: "/images/products/pleated-wool-trousers-2.svg",
        altText: "Pleated Wool Trousers in Black, side view",
        position: 2,
      },
    ],
    variants: [
      { size: "S", color: "Charcoal", colorHex: "#3B4045", sku: "JA-PWT-CHR-S", stockQty: 9 },
      { size: "M", color: "Charcoal", colorHex: "#3B4045", sku: "JA-PWT-CHR-M", stockQty: 14 },
      { size: "L", color: "Charcoal", colorHex: "#3B4045", sku: "JA-PWT-CHR-L", stockQty: 8 },
      { size: "M", color: "Black", colorHex: "#1A1A1A", sku: "JA-PWT-BLK-M", stockQty: 11 },
      { size: "L", color: "Black", colorHex: "#1A1A1A", sku: "JA-PWT-BLK-L", stockQty: 7 },
    ],
  },
  {
    slug: "cropped-tweed-jacket",
    name: "Cropped Tweed Jacket",
    description:
      "A cropped jacket in textured boucle tweed with a rounded neckline, frayed edges and tonal trim. Sample stage: sizing and finishing under review.",
    composition: "Shell: 45% cotton, 30% wool, 25% polyester. Trim: 100% cotton.",
    care: "Dry clean only. Brush the trim gently; do not steam it.",
    basePriceCents: 21900,
    categorySlug: "blazers",
    status: "draft",
    images: [
      {
        path: "/images/products/cropped-tweed-jacket-1.svg",
        altText: "Cropped Tweed Jacket in Boucle Ivory, front view",
        position: 1,
      },
    ],
    variants: [
      { size: "S", color: "Boucle Ivory", colorHex: "#EDE4D3", sku: "JA-CTJ-BIV-S", stockQty: 5 },
      { size: "M", color: "Boucle Ivory", colorHex: "#EDE4D3", sku: "JA-CTJ-BIV-M", stockQty: 5 },
      { size: "L", color: "Boucle Ivory", colorHex: "#EDE4D3", sku: "JA-CTJ-BIV-L", stockQty: 4 },
    ],
  },
  {
    slug: "ribbed-knit-cardigan",
    name: "Ribbed Knit Cardigan",
    description:
      "A chunky ribbed cardigan in a wool-alpaca blend with a shawl collar, dropped shoulders and horn-look buttons. Sample stage: final yarn being confirmed.",
    composition: "70% wool, 30% alpaca.",
    care: "Hand wash cold. Dry flat away from heat.",
    basePriceCents: 14500,
    categorySlug: "knitwear",
    status: "draft",
    images: [
      {
        path: "/images/products/ribbed-knit-cardigan-1.svg",
        altText: "Ribbed Knit Cardigan in Oatmeal, front view",
        position: 1,
      },
    ],
    variants: [
      { size: "S", color: "Oatmeal", colorHex: "#D8C7AE", sku: "JA-RKC-OAT-S", stockQty: 4 },
      { size: "M", color: "Oatmeal", colorHex: "#D8C7AE", sku: "JA-RKC-OAT-M", stockQty: 4 },
      { size: "L", color: "Oatmeal", colorHex: "#D8C7AE", sku: "JA-RKC-OAT-L", stockQty: 3 },
      { size: "M", color: "Chocolate", colorHex: "#5A3E2B", sku: "JA-RKC-CHO-M", stockQty: 2 },
    ],
  },
  {
    slug: "satin-evening-gown",
    name: "Satin Evening Gown",
    description:
      "A floor-length gown in heavyweight satin with a draped bodice and a low back. Archived from the previous season.",
    composition: "100% polyester satin.",
    care: "Dry clean only. Steam on low and store hanging.",
    basePriceCents: 29900,
    categorySlug: "dresses",
    status: "archived",
    images: [
      {
        path: "/images/products/satin-evening-gown-1.svg",
        altText: "Satin Evening Gown in Black, front view",
        position: 1,
      },
    ],
    variants: [
      { size: "S", color: "Black", colorHex: "#1A1A1A", sku: "JA-SEG-BLK-S", stockQty: 2 },
      { size: "M", color: "Black", colorHex: "#1A1A1A", sku: "JA-SEG-BLK-M", stockQty: 3 },
      { size: "L", color: "Black", colorHex: "#1A1A1A", sku: "JA-SEG-BLK-L", stockQty: 1 },
    ],
  },
];

export interface SeedAdminAccount {
  email: string;
  passwordHash: string;
  roles: AccountRoleName[];
}

export const seedAdminAccount: SeedAdminAccount = {
  email: "admin@j-armando.store",
  // scrypt hash of "Admin123!" with 16-byte salt
  passwordHash:
    "bd47c7e1fcae4e148b0c4d84fb9252bb:f711bed153cbdf40d9de4fa4c88afaeda4d8c68d103f3cad451c7080fe5b29a8441490fd35f6c6ce4963de38e38912b304b655381237ae799f8b21f793e5839f",
  roles: ["customer", "admin"],
};

