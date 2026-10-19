import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getOrderForAdmin, listAllOrdersForAdmin } from "../admin-orders.ts";
import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import { createPaidOrderFromCheckout } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("admin order list and detail (db/admin-orders.ts)", () => {
  let testDb: TestDatabase;
  let variantId1: string;
  let variantId2: string;
  let standardMethod: ShippingMethod;
  let expressMethod: ShippingMethod;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazer = await getPublishedProductBySlug(
      testDb.db,
      "double-breasted-linen-blazer",
    );
    const trousers = await getPublishedProductBySlug(
      testDb.db,
      "pleated-wool-trousers",
    );
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

  it("Scenario 2: returns empty array when no orders exist in the database", async () => {
    const orders = await listAllOrdersForAdmin(testDb.db);
    expect(orders).toEqual([]);
  });

  it("Scenario 1 & 3: lists orders across all distinct customer accounts in descending order and retrieves full details for any customer's order", async () => {
    // 1. Customer A places an order
    const sessionA = randomUUID();
    await addVariantToCart(testDb.db, sessionA, variantId1, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionA, {
      email: "alice.customer@example.com",
      recipientName: "Alice Customer",
      line1: "100 Madison Ave",
      city: "New York",
      state: "NY",
      zip: "10016",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionA, standardMethod.id);
    const createdA = await createPaidOrderFromCheckout(testDb.db, sessionA);
    if (!createdA.ok) throw new Error("expected order A creation to succeed");

    // Ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 25));

    // 2. Customer B places an order with 2 items
    const sessionB = randomUUID();
    await addVariantToCart(testDb.db, sessionB, variantId2, 2);
    await saveCheckoutContactAndAddress(testDb.db, sessionB, {
      email: "bob.shopper@example.com",
      recipientName: "Bob Shopper",
      line1: "500 Market St",
      line2: "Apt 12B",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
      phone: "+1 415-555-0142",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionB, expressMethod.id);
    const createdB = await createPaidOrderFromCheckout(testDb.db, sessionB);
    if (!createdB.ok) throw new Error("expected order B creation to succeed");

    expect(createdA.accountId).not.toBe(createdB.accountId);

    // 3. Admin lists all orders across all customers
    const allOrders = await listAllOrdersForAdmin(testDb.db);
    expect(allOrders.length).toBe(2);

    // Descending createdAt order (newest first: B then A)
    expect(allOrders[0].reference).toBe(createdB.order.reference);
    expect(allOrders[0].contactEmail).toBe("bob.shopper@example.com");
    expect(allOrders[0].accountId).toBe(createdB.accountId);
    expect(allOrders[0].status).toBe("paid");
    expect(allOrders[0].fulfillmentStatus).toBe("unfulfilled");
    expect(allOrders[0].itemCount).toBe(2);
    expect(allOrders[0].lineCount).toBe(1);
    expect(allOrders[0].totalCents).toBe(createdB.order.totalCents);
    expect(allOrders[0].currency).toBe("USD");
    expect(Number.isInteger(allOrders[0].totalCents)).toBe(true);

    expect(allOrders[1].reference).toBe(createdA.order.reference);
    expect(allOrders[1].contactEmail).toBe("alice.customer@example.com");
    expect(allOrders[1].accountId).toBe(createdA.accountId);
    expect(allOrders[1].status).toBe("paid");
    expect(allOrders[1].fulfillmentStatus).toBe("unfulfilled");
    expect(allOrders[1].itemCount).toBe(1);
    expect(allOrders[1].lineCount).toBe(1);
    expect(allOrders[1].totalCents).toBe(createdA.order.totalCents);

    // 4. Admin can fetch full detail for Customer A's order and Customer B's order
    const detailA = await getOrderForAdmin(testDb.db, createdA.order.reference);
    expect(detailA).not.toBeNull();
    expect(detailA?.reference).toBe(createdA.order.reference);
    expect(detailA?.contactEmail).toBe("alice.customer@example.com");
    expect(detailA?.shippingAddress.recipientName).toBe("Alice Customer");
    expect(detailA?.shippingAddress.city).toBe("New York");
    expect(detailA?.shippingMethod.name).toBe(standardMethod.name);
    expect(detailA?.lines.length).toBe(1);
    expect(detailA?.lines[0].quantity).toBe(1);

    const detailB = await getOrderForAdmin(testDb.db, createdB.order.reference);
    expect(detailB).not.toBeNull();
    expect(detailB?.reference).toBe(createdB.order.reference);
    expect(detailB?.contactEmail).toBe("bob.shopper@example.com");
    expect(detailB?.shippingAddress.recipientName).toBe("Bob Shopper");
    expect(detailB?.shippingAddress.line2).toBe("Apt 12B");
    expect(detailB?.shippingAddress.phone).toBe("+1 415-555-0142");
    expect(detailB?.shippingMethod.name).toBe(expressMethod.name);
    expect(detailB?.lines.length).toBe(1);
    expect(detailB?.lines[0].quantity).toBe(2);
    expect(detailB?.totalCents).toBe(createdB.order.totalCents);
  });

  it("Scenario 4: getOrderForAdmin returns null for unknown or empty reference", async () => {
    const unknown = await getOrderForAdmin(testDb.db, "JA-999999");
    expect(unknown).toBeNull();

    const empty = await getOrderForAdmin(testDb.db, "");
    expect(empty).toBeNull();

    const whitespace = await getOrderForAdmin(testDb.db, "   ");
    expect(whitespace).toBeNull();
  });
});
