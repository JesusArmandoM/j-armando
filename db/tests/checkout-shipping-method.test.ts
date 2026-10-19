import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  getCheckoutSession,
  getShippingMethodById,
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("checkout shipping method data access", () => {
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

  it("lists available shipping methods ordered by cost ascending", async () => {
    const methods = await listShippingMethods(testDb.db);
    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods[0].costCents).toBeLessThanOrEqual(methods[1].costCents);
    expect(methods[0].slug).toBe("standard");
    expect(methods[0].costCents).toBe(0);
    expect(methods[1].slug).toBe("express");
    expect(methods[1].costCents).toBe(1500);
  });

  it("retrieves a shipping method by id", async () => {
    const found = await getShippingMethodById(testDb.db, standardMethod.id);
    expect(found).toBeDefined();
    expect(found?.slug).toBe("standard");

    const missing = await getShippingMethodById(testDb.db, randomUUID());
    expect(missing).toBeUndefined();
  });

  it("returns cart_not_found when attempting to save shipping method without an active cart", async () => {
    const sessionToken = randomUUID();
    const result = await saveCheckoutShippingMethod(
      testDb.db,
      sessionToken,
      standardMethod.id,
    );
    expect(result).toEqual({ ok: false, reason: "cart_not_found" });
  });

  it("returns address_required when cart exists but Step 1 (contact and address) is not completed", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);

    const result = await saveCheckoutShippingMethod(
      testDb.db,
      sessionToken,
      standardMethod.id,
    );
    expect(result).toEqual({ ok: false, reason: "address_required" });
  });

  it("returns shipping_method_not_found when passing an invalid shipping method id", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "test@example.com",
      recipientName: "Test User",
      line1: "123 Test St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });

    const result = await saveCheckoutShippingMethod(
      testDb.db,
      sessionToken,
      randomUUID(),
    );
    expect(result).toEqual({ ok: false, reason: "shipping_method_not_found" });
  });

  it("saves shipping method and retrieves joined shipping details via getCheckoutSession", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "alexandra.vance@studio.com",
      recipientName: "Alexandra Vance",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });

    // Before selection, session has null shippingMethod and shippingMethodId
    const beforeSession = await getCheckoutSession(testDb.db, sessionToken);
    expect(beforeSession).toBeDefined();
    expect(beforeSession?.shippingMethodId).toBeNull();
    expect(beforeSession?.shippingMethod).toBeNull();

    // Save standard shipping
    const saveResult = await saveCheckoutShippingMethod(
      testDb.db,
      sessionToken,
      standardMethod.id,
    );
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) return;

    expect(saveResult.checkoutSession.shippingMethodId).toBe(standardMethod.id);
    expect(saveResult.shippingMethod.slug).toBe("standard");

    // After selection, getCheckoutSession returns joined shipping method details
    const afterSession = await getCheckoutSession(testDb.db, sessionToken);
    expect(afterSession).toBeDefined();
    expect(afterSession?.shippingMethodId).toBe(standardMethod.id);
    expect(afterSession?.shippingMethod?.name).toBe("Standard Shipping");
    expect(afterSession?.shippingMethod?.costCents).toBe(0);
    expect(afterSession?.shippingMethod?.deliveryEstimate).toBe("3–5 business days");
  });

  it("allows switching shipping methods and updates the checkout session", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "switch@example.com",
      recipientName: "Switch User",
      line1: "123 Switch Ave",
      city: "New York",
      state: "NY",
      zip: "10001",
    });

    // Select standard first
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    // Switch to express
    const switchResult = await saveCheckoutShippingMethod(
      testDb.db,
      sessionToken,
      expressMethod.id,
    );
    expect(switchResult.ok).toBe(true);
    if (!switchResult.ok) return;

    expect(switchResult.checkoutSession.shippingMethodId).toBe(expressMethod.id);
    expect(switchResult.shippingMethod.slug).toBe("express");
    expect(switchResult.shippingMethod.costCents).toBe(1500);

    const session = await getCheckoutSession(testDb.db, sessionToken);
    expect(session?.shippingMethodId).toBe(expressMethod.id);
    expect(session?.shippingMethod?.name).toBe("Express Shipping");
    expect(session?.shippingMethod?.costCents).toBe(1500);
  });

  it("preserves shippingMethodId when contact email and shipping address are modified", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "preserve@example.com",
      recipientName: "Preserve User",
      line1: "100 Initial Rd",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
    });

    await saveCheckoutShippingMethod(testDb.db, sessionToken, expressMethod.id);

    // Now update address
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "preserve.updated@example.com",
      recipientName: "Preserve User",
      line1: "200 Updated Rd",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
    });

    const session = await getCheckoutSession(testDb.db, sessionToken);
    expect(session?.email).toBe("preserve.updated@example.com");
    expect(session?.line1).toBe("200 Updated Rd");
    expect(session?.shippingMethodId).toBe(expressMethod.id);
    expect(session?.shippingMethod?.slug).toBe("express");
  });
});
