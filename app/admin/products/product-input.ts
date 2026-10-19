import type { VariantSize } from "@/db/schema/index.ts";

export const VALID_VARIANT_SIZES: readonly VariantSize[] = ["XS", "S", "M", "L", "XL"];

const DEFAULT_COLOR_SWATCHES: Record<string, string> = {
  black: "#121212",
  obsidian: "#121212",
  charcoal: "#36383a",
  slate: "#4a5568",
  navy: "#1b2838",
  midnight: "#191970",
  ivory: "#f5f3ef",
  cream: "#f3efe6",
  ecru: "#ede8dc",
  white: "#ffffff",
  camel: "#b68f66",
  sand: "#c8b99e",
  stone: "#8c857b",
  taupe: "#8b7d70",
  olive: "#556b2f",
  forest: "#223d2c",
  burgundy: "#5c1d24",
  espresso: "#3b2820",
  brown: "#5c4033",
  grey: "#71717a",
  gray: "#71717a",
};

export interface ValidatedVariantInput {
  size: VariantSize;
  color: string;
  colorHex: string;
  stockQty: number;
  priceOverrideCents: number | null;
}

export interface ValidatedProductInput {
  name: string;
  slug?: string;
  categoryId: string;
  basePriceCents: number;
  description: string;
  composition: string;
  care: string;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: ValidatedVariantInput[];
}

export type ProductInputValidationResult =
  | { ok: true; data: ValidatedProductInput }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Safely parses a USD dollar input (e.g. "249.00", "249", "$249.50", or 249)
 * into integer cents without floating-point arithmetic.
 * Returns null if the input is malformed, negative, or zero.
 */
export function parsePriceDollarsToCents(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) {
      return null;
    }
    return parsePriceDollarsToCents(raw.toFixed(2));
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim().replace(/^\$/, "").trim();
  if (!trimmed) {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const dollarsPart = Number.parseInt(match[1], 10);
  const centsStr = (match[2] ?? "").padEnd(2, "0");
  const centsPart = Number.parseInt(centsStr, 10);

  if (!Number.isSafeInteger(dollarsPart) || !Number.isSafeInteger(centsPart)) {
    return null;
  }

  const totalCents = dollarsPart * 100 + centsPart;
  if (totalCents <= 0 || totalCents > 100_000_000) {
    return null;
  }

  return totalCents;
}

/**
 * Resolves a valid hex color string (#RRGGBB or #RGB) or falls back to a known
 * swatch or default editorial ink (#121212).
 */
export function resolveColorHex(rawHex: unknown, colorName: string): string | null {
  if (typeof rawHex === "string" && rawHex.trim().length > 0) {
    const trimmed = rawHex.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return null;
  }

  const normalizedColor = colorName.trim().toLowerCase();
  return DEFAULT_COLOR_SWATCHES[normalizedColor] ?? "#121212";
}

function isValidSize(value: unknown): value is VariantSize {
  return (
    typeof value === "string" &&
    (VALID_VARIANT_SIZES as readonly string[]).includes(value.trim())
  );
}

function parseStockQuantity(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 0 || raw > 1_000_000) {
      return null;
    }
    return raw;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
      return null;
    }
    return parsed;
  }

  return null;
}

export function validateAdminProductInput(raw: unknown): ProductInputValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: "Invalid request payload.",
      fieldErrors: { form: "Invalid request payload." },
    };
  }

  const body = raw as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    fieldErrors.name = "Product name is required.";
  } else if (name.length > 160) {
    fieldErrors.name = "Product name must be 160 characters or fewer.";
  }

  const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";

  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  if (!categoryId) {
    fieldErrors.categoryId = "Category is required.";
  }

  let basePriceCents: number | null = null;
  if (body.basePriceCents !== undefined && body.basePriceCents !== null && body.basePriceCents !== "") {
    if (
      typeof body.basePriceCents === "number" &&
      Number.isInteger(body.basePriceCents) &&
      body.basePriceCents > 0
    ) {
      basePriceCents = body.basePriceCents;
    } else {
      fieldErrors.basePrice = "Base price must be a positive integer in cents.";
    }
  } else {
    const rawPriceDollars = body.basePriceDollars ?? body.basePrice;
    basePriceCents = parsePriceDollarsToCents(rawPriceDollars);
    if (basePriceCents === null) {
      fieldErrors.basePrice = "Enter a valid positive USD price (e.g. 249.00).";
    }
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    fieldErrors.description = "Description is required.";
  }

  const rawComposition = body.composition ?? body.material;
  const composition = typeof rawComposition === "string" ? rawComposition.trim() : "";
  if (!composition) {
    fieldErrors.composition = "Composition / material is required.";
  }

  const care = typeof body.care === "string" ? body.care.trim() : "";
  if (!care) {
    fieldErrors.care = "Care instructions are required.";
  }

  const rawImageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  let imageUrl: string | null = null;
  if (rawImageUrl.length > 0) {
    if (
      rawImageUrl.startsWith("/") ||
      rawImageUrl.startsWith("https://") ||
      rawImageUrl.startsWith("http://")
    ) {
      imageUrl = rawImageUrl;
    } else {
      fieldErrors.imageUrl = "Image URL must start with /, http://, or https://.";
    }
  }

  const rawImageAlt = typeof body.imageAlt === "string" ? body.imageAlt.trim() : "";
  const imageAlt = imageUrl ? rawImageAlt || name || "Product image" : null;

  const rawVariants = body.variants;
  const validatedVariants: ValidatedVariantInput[] = [];

  if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
    fieldErrors.variants = "At least one variant (size and color) is required.";
  } else {
    const seenPairs = new Set<string>();

    for (let i = 0; i < rawVariants.length; i++) {
      const item = rawVariants[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fieldErrors[`variants.${i}`] = `Variant #${i + 1} is invalid.`;
        continue;
      }

      const v = item as Record<string, unknown>;
      const rawSize = typeof v.size === "string" ? v.size.trim().toUpperCase() : "";
      if (!isValidSize(rawSize)) {
        fieldErrors[`variants.${i}.size`] =
          `Variant #${i + 1}: size must be one of XS, S, M, L, XL.`;
      }

      const color = typeof v.color === "string" ? v.color.trim() : "";
      if (!color) {
        fieldErrors[`variants.${i}.color`] = `Variant #${i + 1}: color is required.`;
      }

      const colorHex = resolveColorHex(v.colorHex, color);
      if (colorHex === null) {
        fieldErrors[`variants.${i}.colorHex`] =
          `Variant #${i + 1}: color hex must be a valid hex code (e.g. #121212).`;
      }

      const rawStock = v.stockQty !== undefined ? v.stockQty : v.stock;
      const stockQty = parseStockQuantity(rawStock);
      if (stockQty === null) {
        fieldErrors[`variants.${i}.stockQty`] =
          `Variant #${i + 1}: stock must be a whole number of 0 or greater.`;
      }

      let priceOverrideCents: number | null = null;
      if (
        v.priceOverrideCents !== undefined &&
        v.priceOverrideCents !== null &&
        v.priceOverrideCents !== ""
      ) {
        if (
          typeof v.priceOverrideCents === "number" &&
          Number.isInteger(v.priceOverrideCents) &&
          v.priceOverrideCents > 0
        ) {
          priceOverrideCents = v.priceOverrideCents;
        } else {
          fieldErrors[`variants.${i}.priceOverride`] =
            `Variant #${i + 1}: price override must be a positive amount.`;
        }
      } else if (
        v.priceOverrideDollars !== undefined &&
        v.priceOverrideDollars !== null &&
        String(v.priceOverrideDollars).trim() !== ""
      ) {
        const parsedOverride = parsePriceDollarsToCents(v.priceOverrideDollars);
        if (parsedOverride === null) {
          fieldErrors[`variants.${i}.priceOverride`] =
            `Variant #${i + 1}: price override must be a valid USD price.`;
        } else {
          priceOverrideCents = parsedOverride;
        }
      }

      if (isValidSize(rawSize) && color) {
        const pairKey = `${rawSize}::${color.toLowerCase()}`;
        if (seenPairs.has(pairKey)) {
          fieldErrors[`variants.${i}.color`] =
            `Duplicate variant combination: ${rawSize} / ${color}.`;
        } else {
          seenPairs.add(pairKey);
        }
      }

      if (
        isValidSize(rawSize) &&
        color &&
        colorHex !== null &&
        stockQty !== null &&
        !fieldErrors[`variants.${i}.priceOverride`] &&
        !fieldErrors[`variants.${i}.color`]
      ) {
        validatedVariants.push({
          size: rawSize,
          color,
          colorHex,
          stockQty,
          priceOverrideCents,
        });
      }
    }
  }

  const errorKeys = Object.keys(fieldErrors);
  if (errorKeys.length > 0 || basePriceCents === null) {
    const firstError = fieldErrors[errorKeys[0]] ?? "Please correct the highlighted fields.";
    return {
      ok: false,
      error: firstError,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      name,
      ...(rawSlug ? { slug: rawSlug } : {}),
      categoryId,
      basePriceCents,
      description,
      composition,
      care,
      imageUrl,
      imageAlt,
      variants: validatedVariants,
    },
  };
}
