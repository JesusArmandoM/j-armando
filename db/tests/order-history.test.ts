import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import {
  createPaidOrderFromCheckout,
  getOrderByReferenceForAccount,
  listOrdersForAccount,
} from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("customer order history (db/order.ts)", () => {
  let testDb: TestDatabase;
  let variantId1: string;
  let variantId2: string;
  let standardMethod: ShippingMethod;
  let expressMethod: ShippingMethod;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazer = await getPublishedProductBySlug(testDb.db, "double-breasted-linen-blazer");
    const trousers = await getPublishedProductBySlug(testDb.db, "pleated-wool-trousers");
    if (!blazer?.variants.length || !trousers?.variants.length) {
      throw new Error("expected seeded products with variants");
    }
    variantId1 = blazer.variants[0].id;
    variantId2 = trousers.variants[0].id;

    const methods = await listShippingMethods(testDb.db);
    const standard = methods.find((m) => m.slug === "standard");
    const express = methods.find((m) => m.slug === "express");
    if (!standard || !express) {
      throw new Error("expected standard and express shipping methods");
    }
    standardMethod = standard;
    expressMethod = express;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("returns empty array for an account with no orders or non-existent account", async () => {
    const emptyAccountId = randomUUID();
    const orders = await listOrdersForAccount(testDb.db, emptyAccountId);
    expect(orders).toEqual([]);

    const emptyIdOrders = await listOrdersForAccount(testDb.db, "");
    expect(emptyIdOrders).toEqual([]);
  });

  it("lists orders owned by account in descending order with frozen totals and lines", async () => {
    // 1. Create order 1 for Customer A
    const sessionTokenA1 = randomUUID();
    await addVariantToCart(testDb.db, sessionTokenA1, variantId1, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionTokenA1, {
      email: "customer-a@example.com",
      recipientName: "Customer A",
      line1: "123 First Ave",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionTokenA1, standardMethod.id);
    const orderResultA1 = await createPaidOrderFromCheckout(testDb.db, sessionTokenA1);
    if (!orderResultA1.ok) throw new Error("failed to create order A1");
    const accountIdA = orderResultA1.accountId;

    // Small delay to ensure distinct createdAt timestamps
    await new Promise((r) => setTimeout(r, 20));

    // 2. Create order 2 for Customer A
    const sessionTokenA2 = randomUUID();
    await addVariantToCart(testDb.db, sessionTokenA2, variantId2, 2);
    await saveCheckoutContactAndAddress(testDb.db, sessionTokenA2, {
      email: "customer-a@example.com",
      recipientName: "Customer A",
      line1: "123 First Ave",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionTokenA2, expressMethod.id);
    const orderResultA2 = await createPaidOrderFromCheckout(testDb.db, sessionTokenA2);
    if (!orderResultA2.ok) throw new Error("failed to create order A2");

    // 3. Create order 1 for Customer B
    const sessionTokenB1 = randomUUID();
    await addVariantToCart(testDb.db, sessionTokenB1, variantId1, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionTokenB1, {
      email: "customer-b@example.com",
      recipientName: "Customer B",
      line1: "456 Second Ave",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionTokenB1, standardMethod.id);
    const orderResultB1 = await createPaidOrderFromCheckout(testDb.db, sessionTokenB1);
    if (!orderResultB1.ok) throw new Error("failed to create order B1");
    const accountIdB = orderResultB1.accountId;

    expect(accountIdA).not.toBe(accountIdB);

    // 4. List orders for Customer A
    const ordersA = await listOrdersForAccount(testDb.db, accountIdA);
    expect(ordersA.length).toBe(2);

    // Assert descending order by createdAt (newest first)
    expect(ordersA[0].reference).toBe(orderResultA2.order.reference);
    expect(ordersA[1].reference).toBe(orderResultA1.order.reference);
    expect(ordersA[0].createdAt.getTime()).toBeGreaterThanOrEqual(ordersA[1].createdAt.getTime());

    // Assert frozen totals and lines on order A2
    expect(ordersA[0].totalCents).toBe(orderResultA2.order.totalCents);
    expect(ordersA[0].lineCount).toBe(1);
    expect(ordersA[0].itemCount).toBe(2);
    expect(ordersA[0].lines[0].variantId).toBe(variantId2);
    expect(ordersA[0].lines[0].quantity).toBe(2);
    expect(ordersA[0].shippingAddress.city).toBe("New York");
    expect(ordersA[0].shippingMethod.name).toBe(expressMethod.name);

    // 5. List orders for Customer B
    const ordersB = await listOrdersForAccount(testDb.db, accountIdB);
    expect(ordersB.length).toBe(1);
    expect(ordersB[0].reference).toBe(orderResultB1.order.reference);
    expect(ordersB[0].shippingAddress.city).toBe("San Francisco");

    // Cross-customer data isolation: Customer A sees no Customer B orders, and vice versa
    const referencesA = ordersA.map((o) => o.reference);
    expect(referencesA).not.toContain(orderResultB1.order.reference);
    const referencesB = ordersB.map((o) => o.reference);
    expect(referencesB).not.toContain(orderResultA1.order.reference);
    expect(referencesB).not.toContain(orderResultA2.order.reference);
  });

  it("retrieves order by reference strictly matching accountId (getOrderByReferenceForAccount)", async () => {
    // Create an order for Customer C
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId1, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "customer-c@example.com",
      recipientName: "Customer C",
      line1: "789 Third Ave",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    if (!result.ok) throw new Error("failed to create order");

    const { reference } = result.order;
    const accountId = result.accountId;
    const foreignAccountId = randomUUID();

    // Owner can fetch their own order
    const order = await getOrderByReferenceForAccount(testDb.db, reference, accountId);
    expect(order).not.toBeNull();
    expect(order?.reference).toBe(reference);
    expect(order?.contactEmail).toBe("customer-c@example.com");
    expect(order?.lines.length).toBe(1);
    expect(order?.shippingAddress.city).toBe("Austin");
    expect(order?.totalCents).toBe(result.order.totalCents);

    // Foreign account cannot fetch this order (returns null)
    const foreignOrder = await getOrderByReferenceForAccount(testDb.db, reference, foreignAccountId);
    expect(foreignOrder).toBeNull();

    // Unknown reference returns null
    const unknownOrder = await getOrderByReferenceForAccount(testDb.db, "JA-999999", accountId);
    expect(unknownOrder).toBeNull();

    // Empty parameters return null
    expect(await getOrderByReferenceForAccount(testDb.db, "", accountId)).toBeNull();
    expect(await getOrderByReferenceForAccount(testDb.db, reference, "")).toBeNull();
  });
});
