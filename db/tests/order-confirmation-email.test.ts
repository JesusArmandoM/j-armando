import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import { createPaidOrderFromCheckout, getOrderByReference } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";
import {
  clearSentEmails,
  createSimulatedEmailSender,
  getSentConfirmationEmails,
  setEmailSender,
} from "@/lib/email/order-confirmation.ts";
import { createSimulatedPaymentProvider } from "@/payments/simulated-provider.ts";

describe("order confirmation email on payment (db/order.ts & lib/email)", () => {
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

  beforeEach(() => {
    setEmailSender(null);
    clearSentEmails();
  });

  it("triggers exactly 1 confirmation email to contact email with matching reference and frozen financial breakdown upon successful payment", async () => {
    const sessionToken = randomUUID();
    // Subtotal: 2 * 24900 = 49800 cents ($498.00)
    await addVariantToCart(testDb.db, sessionToken, variantId, 2);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "buyer@example.com",
      recipientName: "Taylor Swift",
      line1: "13 Cornelia St",
      city: "New York",
      state: "NY",
      zip: "10014",
      country: "US",
    });
    // Standard shipping is 0 cents ($0.00)
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const expectedSubtotal = 49800;
    const expectedShipping = 0;
    const expectedTax = Math.round(expectedSubtotal * 0.08); // 3984
    const expectedTotal = expectedSubtotal + expectedShipping + expectedTax; // 53784

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected payment to succeed");

    const sentEmails = getSentConfirmationEmails();
    expect(sentEmails).toHaveLength(1);

    const email = sentEmails[0];
    expect(email.to).toBe("buyer@example.com");
    expect(email.subject).toBe(`Order Confirmation - ${result.order.reference}`);
    expect(email.payload.reference).toBe(result.order.reference);
    expect(email.payload.subtotalCents).toBe(expectedSubtotal);
    expect(email.payload.shippingCents).toBe(expectedShipping);
    expect(email.payload.taxCents).toBe(expectedTax);
    expect(email.payload.totalCents).toBe(expectedTotal);

    // Verify recipient & shipping address
    expect(email.payload.shippingAddress).toEqual({
      recipientName: "Taylor Swift",
      line1: "13 Cornelia St",
      city: "New York",
      state: "NY",
      zip: "10014",
    });

    // Verify lines
    expect(email.payload.lines).toHaveLength(1);
    expect(email.payload.lines[0].productName).toBe("Double-Breasted Linen Blazer");
    expect(email.payload.lines[0].quantity).toBe(2);
    expect(email.payload.lines[0].unitPriceCents).toBe(24900);
    expect(email.payload.lines[0].lineTotalCents).toBe(49800);

    // Verify text content formatting
    expect(email.text).toContain(`Order Reference: ${result.order.reference}`);
    expect(email.text).toContain("Subtotal: $498.00");
    expect(email.text).toContain("Shipping: $0.00");
    expect(email.text).toContain("Estimated Tax: $39.84");
    expect(email.text).toContain("Total: $537.84");
    expect(email.text).toContain("Taylor Swift");
    expect(email.text).toContain("13 Cornelia St");

    // Verify HTML content formatting
    expect(email.html).toContain(result.order.reference);
    expect(email.html).toContain("$498.00");
    expect(email.html).toContain("$537.84");
    expect(email.html).toContain("Double-Breasted Linen Blazer");
  });

  it("does not trigger confirmation email when payment fails", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "failed-pay@example.com",
      recipientName: "Bob Smith",
      line1: "100 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const failingProvider = createSimulatedPaymentProvider({
      scenario: "fail",
      failureReason: "insufficient_funds",
    });

    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken, failingProvider);
    expect(result.ok).toBe(false);

    const sentEmails = getSentConfirmationEmails();
    expect(sentEmails).toHaveLength(0);
  });

  it("does not trigger confirmation email when checkout is incomplete", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);

    // Missing address
    const result1 = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result1.ok).toBe(false);
    expect(getSentConfirmationEmails()).toHaveLength(0);

    // Add address but missing shipping method
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "buyer@example.com",
      recipientName: "Bob Smith",
      line1: "100 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    const result2 = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result2.ok).toBe(false);
    expect(getSentConfirmationEmails()).toHaveLength(0);
  });

  it("gracefully completes order creation even if email delivery fails", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "resilient@example.com",
      recipientName: "Grace Hopper",
      line1: "1 Computer Way",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, expressMethod.id);

    // Create custom email sender that throws an error
    const failingEmailSender = createSimulatedEmailSender({
      shouldFail: true,
      failureError: new Error("Simulated email service offline"),
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await createPaidOrderFromCheckout(
        testDb.db,
        sessionToken,
        undefined,
        failingEmailSender,
      );

      // Order creation still succeeds!
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected order creation to succeed despite email error");

      expect(result.order.reference).toMatch(/^JA-\d{6}$/);

      // Verify the order was persisted in database
      const savedOrder = await getOrderByReference(testDb.db, result.order.reference);
      expect(savedOrder).toBeDefined();
      expect(savedOrder?.status).toBe("paid");
      expect(savedOrder?.contactEmail).toBe("resilient@example.com");

      // Verify console.error logged without sensitive data
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedCalls = consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedCalls).toContain("[order-confirmation-email]");
      expect(loggedCalls).toContain("Simulated email service offline");
      // Must not leak customer email or street address
      expect(loggedCalls).not.toContain("resilient@example.com");
      expect(loggedCalls).not.toContain("1 Computer Way");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
