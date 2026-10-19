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
import { address, cart, order, orderLine, payment, variant } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("payment failure path (db/tests/payment-failure-path.test.ts)", () => {
  let testDb: TestDatabase;
  let variantId: string;
  let initialStock: number;
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
    initialStock = blazer.variants[0].stockQty;

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

  it("leaves no paid order, does not decrement stock, and preserves active cart on payment failure", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 2);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "shopper-fail@example.com",
      recipientName: "Taylor Swift",
      line1: "13 Cornelia St",
      city: "New York",
      state: "NY",
      zip: "10014",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    // Verify stock before payment attempt
    const [stockBefore] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(stockBefore.stockQty).toBe(initialStock);

    // Execute checkout payment with fail scenario
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken, {
      scenario: "fail",
      failureReason: "card_declined",
    });

    expect(result).toEqual({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.failed",
      failureReason: "card_declined",
    });

    // Verify no paid order row, order lines, payment, or address were created
    const orders = await testDb.db.select().from(order);
    expect(orders.length).toBe(0);

    const payments = await testDb.db.select().from(payment);
    expect(payments.length).toBe(0);

    const lines = await testDb.db.select().from(orderLine);
    expect(lines.length).toBe(0);

    const addresses = await testDb.db.select().from(address);
    expect(addresses.length).toBe(0);

    // Verify cart status remains 'active' (not converted)
    const [activeCart] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, sessionToken));
    expect(activeCart).toBeDefined();
    expect(activeCart.status).toBe("active");

    // Verify cart lines are preserved and recoverable
    const cartSummary = await getCartSummary(testDb.db, sessionToken);
    expect(cartSummary).toBeDefined();
    expect(cartSummary?.lines.length).toBe(1);
    expect(cartSummary?.lines[0].quantity).toBe(2);

    // Verify variant stock is not permanently decremented
    const [stockAfter] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(stockAfter.stockQty).toBe(initialStock);
  });

  it("leaves no paid order and preserves active cart on pending payment authorization", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "shopper-pending@example.com",
      recipientName: "Jordan Smith",
      line1: "500 Madison Ave",
      city: "New York",
      state: "NY",
      zip: "10022",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken, {
      scenario: "pending",
    });

    expect(result).toEqual({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.pending",
      failureReason: undefined,
    });

    // Verify no order or payment created
    const orders = await testDb.db.select().from(order);
    expect(orders.length).toBe(0);

    const payments = await testDb.db.select().from(payment);
    expect(payments.length).toBe(0);

    // Verify cart remains active
    const [activeCart] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, sessionToken));
    expect(activeCart.status).toBe("active");

    // Verify cart lines remain intact
    const cartSummary = await getCartSummary(testDb.db, sessionToken);
    expect(cartSummary?.lines.length).toBe(1);

    // Verify stock unchanged
    const [stockRow] = await testDb.db
      .select({ stockQty: variant.stockQty })
      .from(variant)
      .where(eq(variant.id, variantId));
    expect(stockRow.stockQty).toBe(initialStock);
  });

  it("allows retrying the preserved cart with success to produce a paid order and convert the cart", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 2);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "shopper-retry@example.com",
      recipientName: "Morgan Riley",
      line1: "100 Broadway",
      city: "New York",
      state: "NY",
      zip: "10005",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    // 1. Initial attempt fails
    const failResult = await createPaidOrderFromCheckout(testDb.db, sessionToken, {
      scenario: "fail",
      failureReason: "card_declined",
    });
    expect(failResult.ok).toBe(false);

    // Cart is still active and retrievable
    const cartBeforeRetry = await getCartSummary(testDb.db, sessionToken);
    expect(cartBeforeRetry?.lines.length).toBe(1);

    // 2. Retry payment with succeed scenario
    const successResult = await createPaidOrderFromCheckout(testDb.db, sessionToken, {
      scenario: "succeed",
    });

    expect(successResult.ok).toBe(true);
    if (!successResult.ok) throw new Error("Expected retry to succeed");

    expect(successResult.order.reference).toMatch(/^JA-\d{6}$/);
    expect(successResult.order.contactEmail).toBe("shopper-retry@example.com");

    // 3. Paid order is now in DB
    const createdOrder = await getOrderByReference(testDb.db, successResult.order.reference);
    expect(createdOrder).toBeDefined();
    expect(createdOrder?.status).toBe("paid");
    expect(createdOrder?.lines.length).toBe(1);
    expect(createdOrder?.lines[0].quantity).toBe(2);

    // 4. Cart is converted
    const [cartRow] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, sessionToken));
    expect(cartRow.status).toBe("converted");

    const cartAfterSuccess = await getCartSummary(testDb.db, sessionToken);
    expect(cartAfterSuccess).toBeUndefined();
  });
});
