import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addVariantToCart,
  getCartSummary,
  removeCartLine,
  updateCartLineQuantity,
} from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import type { ProductDetail, ProductDetailVariant } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("guest cart management data access", () => {
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

  it("updates line quantity and updates line total and subtotal", async () => {
    const token = `session-${randomUUID()}`;
    const v = variantOf(blazer, "M", "Ivory");

    const addRes = await addVariantToCart(testDb.db, token, v.id, 2);
    if (!addRes.ok) throw new Error("failed to add");

    const updateRes = await updateCartLineQuantity(testDb.db, token, addRes.lineId, 4);
    expect(updateRes).toEqual({ ok: true, lineId: addRes.lineId, quantity: 4 });

    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeDefined();
    expect(summary!.lines).toHaveLength(1);
    expect(summary!.lines[0].quantity).toBe(4);
    expect(summary!.lines[0].lineTotalCents).toBe(4 * summary!.lines[0].unitPriceCents);
    expect(summary!.subtotalCents).toBe(summary!.lines[0].lineTotalCents);
  });

  it("returns not_found when updating a line that does not exist or wrong session", async () => {
    const tokenA = `session-${randomUUID()}`;
    const tokenB = `session-${randomUUID()}`;
    const v = variantOf(blazer, "M", "Ivory");

    const addRes = await addVariantToCart(testDb.db, tokenA, v.id, 1);
    if (!addRes.ok) throw new Error("failed to add");

    // Random non-existent line
    const nonExistent = await updateCartLineQuantity(testDb.db, tokenA, randomUUID(), 2);
    expect(nonExistent).toEqual({ ok: false, reason: "not_found" });

    // Session B cannot update Session A's line
    const crossSession = await updateCartLineQuantity(testDb.db, tokenB, addRes.lineId, 5);
    expect(crossSession).toEqual({ ok: false, reason: "not_found" });

    // Verify session A's line was untouched
    const summaryA = await getCartSummary(testDb.db, tokenA);
    expect(summaryA!.lines[0].quantity).toBe(1);
  });

  it("removes a line and updates subtotal", async () => {
    const token = `session-${randomUUID()}`;
    const v1 = variantOf(blazer, "M", "Ivory");
    const v2 = variantOf(overcoat, "M", "Camel");

    const add1 = await addVariantToCart(testDb.db, token, v1.id, 1);
    const add2 = await addVariantToCart(testDb.db, token, v2.id, 2);
    if (!add1.ok || !add2.ok) throw new Error("failed to add");

    const removeRes = await removeCartLine(testDb.db, token, add1.lineId);
    expect(removeRes).toEqual({ ok: true, lineId: add1.lineId });

    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeDefined();
    expect(summary!.lines).toHaveLength(1);
    expect(summary!.lines[0].lineId).toBe(add2.lineId);
    expect(summary!.subtotalCents).toBe(summary!.lines[0].lineTotalCents);
  });

  it("returns not_found when removing a line that does not exist or wrong session", async () => {
    const tokenA = `session-${randomUUID()}`;
    const tokenB = `session-${randomUUID()}`;
    const v = variantOf(blazer, "M", "Ivory");

    const addRes = await addVariantToCart(testDb.db, tokenA, v.id, 1);
    if (!addRes.ok) throw new Error("failed to add");

    // Session B cannot remove Session A's line
    const crossSession = await removeCartLine(testDb.db, tokenB, addRes.lineId);
    expect(crossSession).toEqual({ ok: false, reason: "not_found" });

    // Verify session A still has the line
    const summaryA = await getCartSummary(testDb.db, tokenA);
    expect(summaryA!.lines).toHaveLength(1);
  });

  it("removing all lines leaves the cart empty", async () => {
    const token = `session-${randomUUID()}`;
    const v = variantOf(blazer, "M", "Ivory");

    const addRes = await addVariantToCart(testDb.db, token, v.id, 1);
    if (!addRes.ok) throw new Error("failed to add");

    await removeCartLine(testDb.db, token, addRes.lineId);

    const summary = await getCartSummary(testDb.db, token);
    expect(summary).toBeUndefined();
  });
});
