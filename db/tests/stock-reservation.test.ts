import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import { createPaidOrderFromCheckout } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { cart, cartLine, order, variant } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("stock reservation and concurrency (db/order.ts)", () => {
  let testDb: TestDatabase;
  let variantId: string;
  let standardMethod: ShippingMethod;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazer = await getPublishedProductBySlug(testDb.db, "double-breasted-linen-blazer");
    if (!blazer || blazer.variants.length === 0) {
      throw new Error("expected seeded blazer with variants");
    }
    variantId = blazer.variants[0].id;

    const methods = await listShippingMethods(testDb.db);
    const standard = methods.find((m) => m.slug === "standard");
    if (!standard) {
      throw new Error("expected seeded standard shipping method");
    }
    standardMethod = standard;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("concurrent checkouts of the last unit yield exactly one paid order and never negative stock", async () => {
    // 1. Set variant stock to exactly 1
    await testDb.db
      .update(variant)
      .set({ stockQty: 1 })
      .where(eq(variant.id, variantId));

    // 2. Setup shopper A
    const tokenA = randomUUID();
    await addVariantToCart(testDb.db, tokenA, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, tokenA, {
      email: "shopperA@example.com",
      recipientName: "Shopper A",
      line1: "123 First Ave",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, tokenA, standardMethod.id);

    // 3. Setup shopper B
    const tokenB = randomUUID();
    await addVariantToCart(testDb.db, tokenB, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, tokenB, {
      email: "shopperB@example.com",
      recipientName: "Shopper B",
      line1: "456 Second Ave",
      city: "New York",
      state: "NY",
      zip: "10002",
    });
    await saveCheckoutShippingMethod(testDb.db, tokenB, standardMethod.id);

    // 4. Fire simultaneous checkout requests
    const [resultA, resultB] = await Promise.all([
      createPaidOrderFromCheckout(testDb.db, tokenA),
      createPaidOrderFromCheckout(testDb.db, tokenB),
    ]);

    const results = [resultA, resultB];
    const successful = results.filter((r) => r.ok);
    const outOfStock = results.filter((r) => !r.ok && r.reason === "out_of_stock");

    // Exactly one order succeeds, exactly one fails with out_of_stock
    expect(successful).toHaveLength(1);
    expect(outOfStock).toHaveLength(1);

    if (!outOfStock[0].ok) {
      expect(outOfStock[0].variantId).toBe(variantId);
      expect(outOfStock[0].productName).toBe("Double-Breasted Linen Blazer");
    }

    // Stock in database is exactly 0, never negative
    const [updatedVariant] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(updatedVariant.stockQty).toBe(0);

    // Exactly one order exists in the order table
    const orders = await testDb.db.select().from(order);
    expect(orders).toHaveLength(1);

    // The winning cart is converted; the losing cart remains active
    const winningToken = resultA.ok ? tokenA : tokenB;
    const losingToken = resultA.ok ? tokenB : tokenA;

    const [winningCart] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, winningToken));
    expect(winningCart.status).toBe("converted");

    const [losingCart] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, losingToken));
    expect(losingCart.status).toBe("active");
  });

  it("fails with out_of_stock when variant stock is 0 without creating an order", async () => {
    // Variant is already at 0 stock from previous test
    const token = randomUUID();
    // Insert cart and cart line directly since addVariantToCart checks gt(stockQty, 0)
    const [insertedCart] = await testDb.db
      .insert(cart)
      .values({ sessionToken: token, status: "active" })
      .returning();

    await testDb.db.insert(cartLine).values({
      cartId: insertedCart.id,
      variantId,
      quantity: 1,
    });

    await saveCheckoutContactAndAddress(testDb.db, token, {
      email: "shopper0@example.com",
      recipientName: "Shopper Zero",
      line1: "789 Third Ave",
      city: "New York",
      state: "NY",
      zip: "10003",
    });
    await saveCheckoutShippingMethod(testDb.db, token, standardMethod.id);

    const result = await createPaidOrderFromCheckout(testDb.db, token);
    expect(result).toEqual({
      ok: false,
      reason: "out_of_stock",
      variantId,
      productName: "Double-Breasted Linen Blazer",
    });

    // Stock stays 0
    const [v] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(v.stockQty).toBe(0);

    // Cart remains active
    const [c] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, token));
    expect(c.status).toBe("active");
  });

  it("fails with out_of_stock when cart quantity exceeds available stock", async () => {
    // Set stock to 2
    await testDb.db
      .update(variant)
      .set({ stockQty: 2 })
      .where(eq(variant.id, variantId));

    const token = randomUUID();
    const [insertedCart] = await testDb.db
      .insert(cart)
      .values({ sessionToken: token, status: "active" })
      .returning();

    // Line requests 3 units, exceeding stock of 2
    await testDb.db.insert(cartLine).values({
      cartId: insertedCart.id,
      variantId,
      quantity: 3,
    });

    await saveCheckoutContactAndAddress(testDb.db, token, {
      email: "exceed@example.com",
      recipientName: "Shopper Exceed",
      line1: "101 Fourth Ave",
      city: "New York",
      state: "NY",
      zip: "10004",
    });
    await saveCheckoutShippingMethod(testDb.db, token, standardMethod.id);

    const result = await createPaidOrderFromCheckout(testDb.db, token);
    expect(result).toEqual({
      ok: false,
      reason: "out_of_stock",
      variantId,
      productName: "Double-Breasted Linen Blazer",
    });

    // Stock remains unchanged at 2
    const [v] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(v.stockQty).toBe(2);
  });
});
