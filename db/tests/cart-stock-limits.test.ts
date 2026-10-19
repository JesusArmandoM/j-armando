import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addVariantToCart,
  getCartSummary,
  updateCartLineQuantity,
} from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import type { ProductDetail, ProductDetailVariant } from "../catalog.ts";
import { cart, cartLine, variant } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("cart stock limits data access", () => {
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
      (v) => v.size === size && v.color === color,
    );
    if (!found) throw new Error(`missing variant ${size}/${color}`);
    return found;
  }

  it("rejects addVariantToCart when requested quantity exceeds available stock", async () => {
    const token = `session-${randomUUID()}`;
    // Set a known stock level for a test variant
    const testVariant = variantOf(blazer, "S", "Ivory");
    await testDb.db
      .update(variant)
      .set({ stockQty: 3 })
      .where(eq(variant.id, testVariant.id));

    const result = await addVariantToCart(testDb.db, token, testVariant.id, 4);
    expect(result).toEqual({
      ok: false,
      reason: "stock_exceeded",
      available: 3,
    });

    // Verify no cart or line was created
    const existingCarts = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, token));
    expect(existingCarts).toHaveLength(0);
  });

  it("rejects repeat addVariantToCart when cumulative quantity exceeds available stock", async () => {
    const token = `session-${randomUUID()}`;
    const testVariant = variantOf(blazer, "M", "Navy");
    await testDb.db
      .update(variant)
      .set({ stockQty: 3 })
      .where(eq(variant.id, testVariant.id));

    // First add 2 (within stock of 3)
    const firstAdd = await addVariantToCart(testDb.db, token, testVariant.id, 2);
    expect(firstAdd.ok).toBe(true);

    // Second add 2 (2 + 2 = 4 > 3)
    const secondAdd = await addVariantToCart(testDb.db, token, testVariant.id, 2);
    expect(secondAdd).toEqual({
      ok: false,
      reason: "stock_exceeded",
      available: 3,
    });

    // Check cart line remains at quantity 2
    const summary = await getCartSummary(testDb.db, token);
    expect(summary?.lines[0].quantity).toBe(2);
  });

  it("rejects updateCartLineQuantity when new quantity exceeds variant stock", async () => {
    const token = `session-${randomUUID()}`;
    const testVariant = variantOf(blazer, "L", "Ivory");
    await testDb.db
      .update(variant)
      .set({ stockQty: 4 })
      .where(eq(variant.id, testVariant.id));

    const addRes = await addVariantToCart(testDb.db, token, testVariant.id, 2);
    if (!addRes.ok) throw new Error("failed to add");

    const updateRes = await updateCartLineQuantity(testDb.db, token, addRes.lineId, 5);
    expect(updateRes).toEqual({
      ok: false,
      reason: "stock_exceeded",
      available: 4,
    });

    // Verify quantity in DB unchanged
    const summary = await getCartSummary(testDb.db, token);
    expect(summary?.lines[0].quantity).toBe(2);
  });

  it("automatically clamps line quantity and sets stockAdjusted when stock drops below line quantity", async () => {
    const token = `session-${randomUUID()}`;
    const testVariant = variantOf(overcoat, "M", "Camel");
    await testDb.db
      .update(variant)
      .set({ stockQty: 5 })
      .where(eq(variant.id, testVariant.id));

    const addRes = await addVariantToCart(testDb.db, token, testVariant.id, 4);
    if (!addRes.ok) throw new Error("failed to add");

    // Simulate inventory dropping to 2 (e.g. another purchase happened)
    await testDb.db
      .update(variant)
      .set({ stockQty: 2 })
      .where(eq(variant.id, testVariant.id));

    // Viewing cart summary should detect and reconcile
    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeDefined();
    expect(summary!.lines).toHaveLength(1);
    expect(summary!.lines[0].quantity).toBe(2);
    expect(summary!.lines[0].availableStock).toBe(2);
    expect(summary!.lines[0].stockAdjusted).toBe(true);
    expect(summary!.lines[0].lineTotalCents).toBe(2 * summary!.lines[0].unitPriceCents);
    expect(summary!.subtotalCents).toBe(summary!.lines[0].lineTotalCents);
    expect(summary!.notifications).toBeDefined();
    expect(summary!.notifications![0]).toContain("adjusted to 2");

    // Verify the DB line row was clamped to 2
    const [lineRow] = await testDb.db
      .select({ quantity: cartLine.quantity })
      .from(cartLine)
      .where(eq(cartLine.id, addRes.lineId));
    expect(lineRow.quantity).toBe(2);
  });

  it("removes line and records notification when variant stock drops to 0", async () => {
    const token = `session-${randomUUID()}`;
    const testVariant = variantOf(overcoat, "L", "Camel");
    await testDb.db
      .update(variant)
      .set({ stockQty: 3 })
      .where(eq(variant.id, testVariant.id));

    const addRes = await addVariantToCart(testDb.db, token, testVariant.id, 2);
    if (!addRes.ok) throw new Error("failed to add");

    // Simulate stock dropping to 0
    await testDb.db
      .update(variant)
      .set({ stockQty: 0 })
      .where(eq(variant.id, testVariant.id));

    // Viewing cart summary should remove the line
    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeDefined();
    expect(summary!.lines).toHaveLength(0);
    expect(summary!.lineCount).toBe(0);
    expect(summary!.subtotalCents).toBe(0);
    expect(summary!.notifications).toBeDefined();
    expect(summary!.notifications![0]).toContain("is out of stock and was removed");

    // Verify row deleted from cart_line
    const linesInDb = await testDb.db
      .select()
      .from(cartLine)
      .where(eq(cartLine.id, addRes.lineId));
    expect(linesInDb).toHaveLength(0);
  });
});
