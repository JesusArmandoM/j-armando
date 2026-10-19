import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addVariantToCart, getCartSummary } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import { createPaidOrderFromCheckout, getOrderByReference } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { cart, product } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";
import { createSimulatedPaymentProvider } from "@/payments/simulated-provider.ts";

describe("order creation on payment (db/order.ts)", () => {
  let testDb: TestDatabase;
  let variantId: string;
  let standardMethod: ShippingMethod;
  let expressMethod: ShippingMethod;

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
    const express = methods.find((m) => m.slug === "express");
    if (!standard || !express) {
      throw new Error("expected seeded standard and express shipping methods");
    }
    standardMethod = standard;
    expressMethod = express;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("fails when cart does not exist", async () => {
    const sessionToken = randomUUID();
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result).toEqual({ ok: false, reason: "cart_not_found" });
  });

  it("fails when cart is empty", async () => {
    const sessionToken = randomUUID();
    // create cart without adding lines
    await testDb.db.insert(cart).values({ sessionToken });
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result).toEqual({ ok: false, reason: "cart_empty" });
  });

  it("fails when address (Step 1) is missing", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result).toEqual({ ok: false, reason: "address_required" });
  });

  it("fails when shipping method (Step 2) is missing", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "shopper@example.com",
      recipientName: "Jane Doe",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result).toEqual({ ok: false, reason: "shipping_method_required" });
  });

  it("fails when payment provider returns failed and leaves cart active with no order created", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "failshopper@example.com",
      recipientName: "John Doe",
      line1: "456 Broadway",
      city: "New York",
      state: "NY",
      zip: "10002",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const failingProvider = createSimulatedPaymentProvider({
      scenario: "fail",
      failureReason: "card_declined",
    });

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken, failingProvider);
    expect(result).toEqual({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.failed",
      failureReason: "card_declined",
    });

    // Cart is still active and retrievable
    const cartSummary = await getCartSummary(testDb.db, sessionToken);
    expect(cartSummary?.lines.length).toBe(1);
  });

  it("creates a paid order with frozen lines, prices, tax and shipping on payment success", async () => {
    const sessionToken = randomUUID();
    // Subtotal: double-breasted-linen-blazer base price is 24900 cents ($249.00)
    await addVariantToCart(testDb.db, sessionToken, variantId, 2); // 2 * 24900 = 49800 cents ($498.00)
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "order-test@example.com",
      recipientName: "Alice Wonderland",
      line1: "789 Elm Street",
      line2: "Apt 4B",
      city: "New York",
      state: "NY", // NY rate 0.08: 49800 * 0.08 = 3984 cents ($39.84)
      zip: "10003",
      country: "US",
      phone: "+1 555-123-4567",
    });
    // Express shipping is 1500 cents ($15.00)
    await saveCheckoutShippingMethod(testDb.db, sessionToken, expressMethod.id);

    const expectedSubtotal = 49800;
    const expectedShipping = 1500;
    const expectedTax = Math.round(expectedSubtotal * 0.08); // 3984
    const expectedTotal = expectedSubtotal + expectedShipping + expectedTax; // 55284

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected order creation to succeed");

    expect(result.order.reference).toMatch(/^JA-\d{6}$/);
    expect(result.order.totalCents).toBe(expectedTotal);
    expect(result.order.contactEmail).toBe("order-test@example.com");

    // Retrieve order and verify frozen details
    const orderDetails = await getOrderByReference(testDb.db, result.order.reference);
    expect(orderDetails).toBeDefined();
    expect(orderDetails?.reference).toBe(result.order.reference);
    expect(orderDetails?.status).toBe("paid");
    expect(orderDetails?.fulfillmentStatus).toBe("unfulfilled");
    expect(orderDetails?.subtotalCents).toBe(expectedSubtotal);
    expect(orderDetails?.shippingCents).toBe(expectedShipping);
    expect(orderDetails?.taxCents).toBe(expectedTax);
    expect(orderDetails?.totalCents).toBe(expectedTotal);
    expect(orderDetails?.currency).toBe("USD");
    expect(orderDetails?.paidAt).toBeInstanceOf(Date);

    // Verify shipping address snapshot
    expect(orderDetails?.shippingAddress).toEqual({
      recipientName: "Alice Wonderland",
      line1: "789 Elm Street",
      line2: "Apt 4B",
      city: "New York",
      state: "NY",
      zip: "10003",
      country: "US",
      phone: "+1 555-123-4567",
    });

    // Verify shipping method snapshot
    expect(orderDetails?.shippingMethod.name).toBe(expressMethod.name);
    expect(orderDetails?.shippingMethod.costCents).toBe(expressMethod.costCents);

    // Verify frozen lines
    expect(orderDetails?.lines.length).toBe(1);
    const line = orderDetails?.lines[0];
    expect(line?.productName).toBe("Double-Breasted Linen Blazer");
    expect(line?.unitPriceCents).toBe(24900);
    expect(line?.quantity).toBe(2);
    expect(line?.lineTotalCents).toBe(49800);
    expect(line?.variantId).toBe(variantId);

    // Verify cart is now converted: getCartSummary returns undefined (treated as empty cart in UI)
    const emptySummary = await getCartSummary(testDb.db, sessionToken);
    expect(emptySummary).toBeUndefined();

    // Now test price freeze: simulate catalog product price change
    await testDb.db
      .update(product)
      .set({ basePriceCents: 99900 })
      .where(eq(product.slug, "double-breasted-linen-blazer"));

    // Re-read order: frozen prices MUST NOT change
    const orderAfterPriceChange = await getOrderByReference(testDb.db, result.order.reference);
    expect(orderAfterPriceChange?.lines[0].unitPriceCents).toBe(24900);
    expect(orderAfterPriceChange?.lines[0].lineTotalCents).toBe(49800);
    expect(orderAfterPriceChange?.subtotalCents).toBe(expectedSubtotal);
    expect(orderAfterPriceChange?.totalCents).toBe(expectedTotal);
  });
});
