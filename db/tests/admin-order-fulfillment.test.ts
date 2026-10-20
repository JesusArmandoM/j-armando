import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getOrderForAdmin,
  getNextFulfillmentStatus,
  updateOrderFulfillmentStatus,
} from "../admin-orders.ts";
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
import { order } from "../schema/index.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("admin order fulfillment transitions (db/admin-orders.ts)", () => {
  let testDb: TestDatabase;
  let variantId: string;
  let standardMethod: ShippingMethod;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazer = await getPublishedProductBySlug(
      testDb.db,
      "double-breasted-linen-blazer",
    );
    if (!blazer?.variants.length) {
      throw new Error("expected seeded product with variants");
    }
    variantId = blazer.variants[0].id;

    const methods = await listShippingMethods(testDb.db);
    const standard = methods.find((m) => m.slug === "standard");
    if (!standard) {
      throw new Error("expected standard shipping method");
    }
    standardMethod = standard;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("getNextFulfillmentStatus helper returns sequential progression", () => {
    expect(getNextFulfillmentStatus(null)).toBe("preparing");
    expect(getNextFulfillmentStatus("unfulfilled")).toBe("preparing");
    expect(getNextFulfillmentStatus("preparing")).toBe("shipped");
    expect(getNextFulfillmentStatus("shipped")).toBe("delivered");
    expect(getNextFulfillmentStatus("delivered")).toBeNull();
  });

  it("Scenario 1: transitions a paid order through the full sequential lifecycle (unfulfilled -> preparing -> shipped -> delivered)", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "buyer1@example.com",
      recipientName: "Buyer One",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);
    const created = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    if (!created.ok) throw new Error("expected order creation to succeed");

    const ref = created.order.reference;

    // Initial state is unfulfilled
    const initial = await getOrderForAdmin(testDb.db, ref);
    expect(initial?.status).toBe("paid");
    expect(initial?.fulfillmentStatus).toBe("unfulfilled");

    // 1. unfulfilled -> preparing
    const res1 = await updateOrderFulfillmentStatus(testDb.db, ref, "preparing");
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.order.fulfillmentStatus).toBe("preparing");
    }

    // 2. preparing -> shipped
    const res2 = await updateOrderFulfillmentStatus(testDb.db, ref, "shipped");
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.order.fulfillmentStatus).toBe("shipped");
    }

    // 3. shipped -> delivered
    const res3 = await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    expect(res3.ok).toBe(true);
    if (res3.ok) {
      expect(res3.order.fulfillmentStatus).toBe("delivered");
    }

    // Verify in database
    const finalDetail = await getOrderForAdmin(testDb.db, ref);
    expect(finalDetail?.fulfillmentStatus).toBe("delivered");
  });

  it("Scenario 2: rejects invalid transitions (skipping forward, moving backward, re-transitioning delivered, invalid status)", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "buyer2@example.com",
      recipientName: "Buyer Two",
      line1: "456 Oak St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);
    const created = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    if (!created.ok) throw new Error("expected order creation to succeed");

    const ref = created.order.reference;

    // Current: unfulfilled
    // Reject skipping to shipped
    const skipShipped = await updateOrderFulfillmentStatus(testDb.db, ref, "shipped");
    expect(skipShipped.ok).toBe(false);
    if (!skipShipped.ok) {
      expect(skipShipped.error).toBe("invalid_transition");
    }

    // Reject skipping to delivered
    const skipDelivered = await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    expect(skipDelivered.ok).toBe(false);
    if (!skipDelivered.ok) {
      expect(skipDelivered.error).toBe("invalid_transition");
    }

    // Reject unknown status
    const invalidStatus = await updateOrderFulfillmentStatus(testDb.db, ref, "in_transit");
    expect(invalidStatus.ok).toBe(false);
    if (!invalidStatus.ok) {
      expect(invalidStatus.error).toBe("invalid_transition");
    }

    // Move to preparing
    const prep = await updateOrderFulfillmentStatus(testDb.db, ref, "preparing");
    expect(prep.ok).toBe(true);

    // Current: preparing
    // Reject skipping to delivered
    const skipDeliveredFromPrep = await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    expect(skipDeliveredFromPrep.ok).toBe(false);
    if (!skipDeliveredFromPrep.ok) {
      expect(skipDeliveredFromPrep.error).toBe("invalid_transition");
    }

    // Reject backward to unfulfilled
    const backToUnfulfilled = await updateOrderFulfillmentStatus(testDb.db, ref, "unfulfilled");
    expect(backToUnfulfilled.ok).toBe(false);
    if (!backToUnfulfilled.ok) {
      expect(backToUnfulfilled.error).toBe("invalid_transition");
    }

    // Move to shipped
    const shipped = await updateOrderFulfillmentStatus(testDb.db, ref, "shipped");
    expect(shipped.ok).toBe(true);

    // Current: shipped
    // Reject backward to preparing
    const backToPrep = await updateOrderFulfillmentStatus(testDb.db, ref, "preparing");
    expect(backToPrep.ok).toBe(false);
    if (!backToPrep.ok) {
      expect(backToPrep.error).toBe("invalid_transition");
    }

    // Move to delivered
    const delivered = await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    expect(delivered.ok).toBe(true);

    // Current: delivered (terminal)
    // Reject any further transitions
    const afterDelivered = await updateOrderFulfillmentStatus(testDb.db, ref, "shipped");
    expect(afterDelivered.ok).toBe(false);
    if (!afterDelivered.ok) {
      expect(afterDelivered.error).toBe("invalid_transition");
    }

    const reDelivered = await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    expect(reDelivered.ok).toBe(false);
    if (!reDelivered.ok) {
      expect(reDelivered.error).toBe("invalid_transition");
    }
  });

  it("Scenario 3: rejects attempting to fulfill an unpaid order", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "buyer3@example.com",
      recipientName: "Buyer Three",
      line1: "789 Pine St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);
    const created = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    if (!created.ok) throw new Error("expected order creation to succeed");

    const ref = created.order.reference;

    // Manually simulate an unpaid/pending or cancelled order status
    await testDb.db
      .update(order)
      .set({ status: "cancelled" })
      .where(created.order ? undefined : undefined); // update target order

    const { eq } = await import("drizzle-orm");
    await testDb.db
      .update(order)
      .set({ status: "cancelled" })
      .where(eq(order.reference, ref));

    const result = await updateOrderFulfillmentStatus(testDb.db, ref, "preparing");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("order_not_paid");
      expect(result.message).toContain("cancelled");
    }

    // Fulfillment status remains unchanged
    const orderInDb = await getOrderForAdmin(testDb.db, ref);
    expect(orderInDb?.fulfillmentStatus).toBe("unfulfilled");
  });

  it("Scenario 4: customer order history and order detail reflect updated fulfillment status", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "customer.history@example.com",
      recipientName: "Customer History",
      line1: "100 Broadway",
      city: "New York",
      state: "NY",
      zip: "10005",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);
    const created = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    if (!created.ok) throw new Error("expected order creation to succeed");

    const ref = created.order.reference;
    const accountId = created.accountId;
    if (!accountId) throw new Error("expected customer accountId");

    // Initially unfulfilled for customer
    let customerOrders = await listOrdersForAccount(testDb.db, accountId);
    expect(customerOrders[0].fulfillmentStatus).toBe("unfulfilled");
    let customerDetail = await getOrderByReferenceForAccount(testDb.db, ref, accountId);
    expect(customerDetail?.fulfillmentStatus).toBe("unfulfilled");

    // Admin updates to preparing
    await updateOrderFulfillmentStatus(testDb.db, ref, "preparing");
    customerOrders = await listOrdersForAccount(testDb.db, accountId);
    expect(customerOrders[0].fulfillmentStatus).toBe("preparing");
    customerDetail = await getOrderByReferenceForAccount(testDb.db, ref, accountId);
    expect(customerDetail?.fulfillmentStatus).toBe("preparing");

    // Admin updates to shipped
    await updateOrderFulfillmentStatus(testDb.db, ref, "shipped");
    customerOrders = await listOrdersForAccount(testDb.db, accountId);
    expect(customerOrders[0].fulfillmentStatus).toBe("shipped");
    customerDetail = await getOrderByReferenceForAccount(testDb.db, ref, accountId);
    expect(customerDetail?.fulfillmentStatus).toBe("shipped");

    // Admin updates to delivered
    await updateOrderFulfillmentStatus(testDb.db, ref, "delivered");
    customerOrders = await listOrdersForAccount(testDb.db, accountId);
    expect(customerOrders[0].fulfillmentStatus).toBe("delivered");
    customerDetail = await getOrderByReferenceForAccount(testDb.db, ref, accountId);
    expect(customerDetail?.fulfillmentStatus).toBe("delivered");
  });

  it("Scenario 5: returns not_found for unknown or empty order reference", async () => {
    const notFound = await updateOrderFulfillmentStatus(testDb.db, "JA-NONEXISTENT", "preparing");
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.error).toBe("not_found");
    }

    const empty = await updateOrderFulfillmentStatus(testDb.db, "", "preparing");
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error).toBe("not_found");
    }
  });
});
