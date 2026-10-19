import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addVariantToCart,
  getAddableVariant,
  getCartSummary,
  getOrCreateCart,
} from "../cart.ts";
import {
  getPublishedProductBySlug,
  getProductBySlug,
  insertVariant,
  listVariantsByProductId,
} from "../catalog.ts";
import type { ProductDetail, ProductDetailVariant } from "../catalog.ts";
import { cart, cartLine } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Integration coverage for docs/specs/guest-cart-add.md: scenarios 1, 2, 3, 5
// and 7 plus summary pricing, against a real embedded PostgreSQL 17.

describe("guest cart data access", () => {
  let testDb: TestDatabase;
  let blazer: ProductDetail;
  let overcoat: ProductDetail;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazerRow = await getPublishedProductBySlug(testDb.db, "double-breasted-linen-blazer");
    const overcoatRow = await getPublishedProductBySlug(testDb.db, "longline-wool-overcoat");
    if (!blazerRow || !overcoatRow) throw new Error("expected the seeded blazer and overcoat");
    blazer = blazerRow;
    overcoat = overcoatRow;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  function variantOf(
    product: ProductDetail,
    size: ProductDetailVariant["size"],
    color: string,
  ): ProductDetailVariant {
    const found = product.variants.find(
      (variant) => variant.size === size && variant.color === color,
    );
    if (!found) throw new Error(`missing variant ${size}/${color}`);
    return found;
  }

  async function cartsFor(token: string) {
    return testDb.db.select().from(cart).where(eq(cart.sessionToken, token));
  }

  async function linesFor(cartId: string) {
    return testDb.db.select().from(cartLine).where(eq(cartLine.cartId, cartId));
  }

  it("scenario 1: adding a variant with quantity 2 creates one guest cart and one line", async () => {
    const token = randomUUID();
    const mediumIvory = variantOf(blazer, "M", "Ivory");

    const result = await addVariantToCart(testDb.db, token, mediumIvory.id, 2);

    expect(result).toMatchObject({ ok: true, lineQuantity: 2 });
    if (!result.ok) throw new Error("expected the add to succeed");

    const carts = await cartsFor(token);
    expect(carts).toHaveLength(1);
    expect(carts[0].accountId).toBeNull();
    expect(carts[0].status).toBe("active");
    expect(carts[0].sessionToken).toBe(token);

    const lines = await linesFor(result.cartId);
    expect(lines).toHaveLength(1);
    expect(lines[0].variantId).toBe(mediumIvory.id);
    expect(lines[0].quantity).toBe(2);
  });

  it("scenario 2: adding the same variant again increments the existing line without a duplicate", async () => {
    const token = randomUUID();
    const mediumIvory = variantOf(blazer, "M", "Ivory");

    const first = await addVariantToCart(testDb.db, token, mediumIvory.id, 2);
    const second = await addVariantToCart(testDb.db, token, mediumIvory.id, 2);
    if (!first.ok || !second.ok) throw new Error("expected both adds to succeed");

    expect(first.lineId).toBe(second.lineId);
    expect(second.lineQuantity).toBe(4);

    const lines = await linesFor(first.cartId);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(first.lineId);
    expect(lines[0].quantity).toBe(4);
  });

  it("adds distinct variants as distinct lines and derives integer-cent summary totals", async () => {
    const token = randomUUID();
    const mediumIvory = variantOf(blazer, "M", "Ivory");
    const xlNavy = variantOf(blazer, "XL", "Navy");

    await addVariantToCart(testDb.db, token, mediumIvory.id, 1);
    await addVariantToCart(testDb.db, token, xlNavy.id, 2);

    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeDefined();
    if (!summary) return;

    expect(summary.lineCount).toBe(2);
    expect(summary.currency).toBe("USD");
    // Base price $249.00 and the XL/Navy override $229.00 × 2.
    expect(summary.lines.map((line) => line.unitPriceCents)).toEqual([24900, 22900]);
    expect(summary.lines.map((line) => line.lineTotalCents)).toEqual([24900, 45800]);
    expect(summary.subtotalCents).toBe(70700);
    expect(summary.lines.map((line) => `${line.size}/${line.color}`)).toEqual([
      "M/Ivory",
      "XL/Navy",
    ]);
  });

  it("scenario 3: two sessions are isolated and both carts stay account-free", async () => {
    const tokenA = randomUUID();
    const tokenB = randomUUID();
    const mediumIvory = variantOf(blazer, "M", "Ivory");
    const merino = await getPublishedProductBySlug(testDb.db, "merino-crewneck-sweater");
    if (!merino) throw new Error("expected the seeded sweater");
    const merinoMediumCream = variantOf(merino, "M", "Cream");

    const resultA = await addVariantToCart(testDb.db, tokenA, mediumIvory.id, 1);
    const resultB = await addVariantToCart(testDb.db, tokenB, merinoMediumCream.id, 2);
    if (!resultA.ok || !resultB.ok) throw new Error("expected both adds to succeed");

    expect(resultA.cartId).not.toBe(resultB.cartId);

    const [cartA] = await cartsFor(tokenA);
    const [cartB] = await cartsFor(tokenB);
    expect(cartA.accountId).toBeNull();
    expect(cartB.accountId).toBeNull();

    const summaryA = await getCartSummary(testDb.db, tokenA);
    const summaryB = await getCartSummary(testDb.db, tokenB);
    expect(summaryA?.lines.map((line) => line.productSlug)).toEqual([
      "double-breasted-linen-blazer",
    ]);
    expect(summaryA?.lines[0].variantId).toBe(mediumIvory.id);
    expect(summaryB?.lines.map((line) => line.productSlug)).toEqual([
      "merino-crewneck-sweater",
    ]);
    expect(summaryB?.lines[0].variantId).toBe(merinoMediumCream.id);
  });

  it("scenario 5: unavailable variants are rejected without creating a cart or line", async () => {
    const outOfStock = variantOf(overcoat, "S", "Camel");

    const draft = await getProductBySlug(testDb.db, "cropped-tweed-jacket");
    if (!draft) throw new Error("expected the seeded draft product");
    const draftVariants = await listVariantsByProductId(testDb.db, draft.id);
    const draftVariant = draftVariants[0];
    if (!draftVariant) throw new Error("expected a draft variant");

    const discontinuedId = randomUUID();
    await insertVariant(testDb.db, {
      id: discontinuedId,
      productId: blazer.id,
      size: "XS",
      color: "Black",
      colorHex: "#1A1A1A",
      sku: `JA-TEST-DISC-${discontinuedId.slice(0, 8)}`,
      stockQty: 5,
      discontinued: true,
    });

    const cases = [
      { name: "unknown variant", variantId: randomUUID() },
      { name: "out-of-stock variant", variantId: outOfStock.id },
      { name: "discontinued variant", variantId: discontinuedId },
      { name: "draft product variant", variantId: draftVariant.id },
    ];

    for (const testCase of cases) {
      const token = randomUUID();
      const result = await addVariantToCart(testDb.db, token, testCase.variantId, 2);

      expect(result, testCase.name).toEqual({ ok: false, reason: "variant_unavailable" });
      expect(await cartsFor(token), testCase.name).toHaveLength(0);
      expect(await getCartSummary(testDb.db, token), testCase.name).toBeUndefined();
    }
  });

  it("scenario 7: concurrent adds of the same variant converge on one line with the summed quantity", async () => {
    const token = randomUUID();
    const mediumIvory = variantOf(blazer, "M", "Ivory");

    const [first, second] = await Promise.all([
      addVariantToCart(testDb.db, token, mediumIvory.id, 2),
      addVariantToCart(testDb.db, token, mediumIvory.id, 2),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const carts = await cartsFor(token);
    expect(carts).toHaveLength(1);

    const lines = await linesFor(first.cartId);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(4);
  });

  it("keeps one cart per session token", async () => {
    const token = randomUUID();

    const first = await getOrCreateCart(testDb.db, token);
    const second = await getOrCreateCart(testDb.db, token);

    expect(second.id).toBe(first.id);
    expect(await cartsFor(token)).toHaveLength(1);
    expect(first.accountId).toBeNull();
  });

  it("returns undefined for an unknown session without creating a cart", async () => {
    const token = randomUUID();

    expect(await getCartSummary(testDb.db, token)).toBeUndefined();
    expect(await cartsFor(token)).toHaveLength(0);
  });

  it("resolves only published, non-discontinued, in-stock variants as addable", async () => {
    const mediumIvory = variantOf(blazer, "M", "Ivory");
    expect(await getAddableVariant(testDb.db, mediumIvory.id)).toMatchObject({
      variantId: mediumIvory.id,
      productSlug: "double-breasted-linen-blazer",
      size: "M",
      color: "Ivory",
      priceOverrideCents: null,
      basePriceCents: 24900,
      currency: "USD",
    });

    const xlNavy = variantOf(blazer, "XL", "Navy");
    expect(await getAddableVariant(testDb.db, xlNavy.id)).toMatchObject({
      variantId: xlNavy.id,
      priceOverrideCents: 22900,
    });

    const outOfStock = variantOf(overcoat, "S", "Camel");
    expect(await getAddableVariant(testDb.db, outOfStock.id)).toBeUndefined();
    expect(await getAddableVariant(testDb.db, randomUUID())).toBeUndefined();
  });
});
