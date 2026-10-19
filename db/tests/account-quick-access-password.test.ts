import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../lib/auth/password.ts";
import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import {
  getCheckoutSession,
  listShippingMethods,
  saveCheckoutContactAndAddress,
  saveCheckoutShippingMethod,
} from "../checkout.ts";
import { createPaidOrderFromCheckout, getOrderByReference } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { account } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("account quick access password (db/order.ts & db/checkout.ts)", () => {
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

  it("Scenario 1: checkout with password sets passwordHash on session and created account", async () => {
    const sessionToken = randomUUID();
    const email = "with.password@example.com";
    const rawPassword = "StrongPassword123!";
    const passwordHash = await hashPassword(rawPassword);

    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    const saveResult = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email,
      recipientName: "Alice Walker",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
      passwordHash,
    });
    expect(saveResult.ok).toBe(true);

    // Verify checkout session persisted passwordHash
    const session = await getCheckoutSession(testDb.db, sessionToken);
    expect(session?.passwordHash).toBe(passwordHash);

    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const orderResult = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) throw new Error("Order creation failed");

    expect(orderResult.isNewAccount).toBe(true);
    expect(orderResult.hasPassword).toBe(true);

    // Verify account row has the password hash and can be verified
    const [createdAccount] = await testDb.db
      .select()
      .from(account)
      .where(eq(account.id, orderResult.accountId));
    expect(createdAccount.passwordHash).toBe(passwordHash);
    expect(createdAccount.passwordHash).not.toBe(rawPassword);

    const isMatch = await verifyPassword(rawPassword, createdAccount.passwordHash!);
    expect(isMatch).toBe(true);

    const isWrongMatch = await verifyPassword("WrongPassword123", createdAccount.passwordHash!);
    expect(isWrongMatch).toBe(false);

    // Verify getOrderByReference returns hasPassword: true
    const orderDetails = await getOrderByReference(testDb.db, orderResult.order.reference);
    expect(orderDetails?.hasPassword).toBe(true);
  });

  it("Scenario 2: checkout without password creates account with null passwordHash", async () => {
    const sessionToken = randomUUID();
    const email = "no.password@example.com";

    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    const saveResult = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email,
      recipientName: "Bob Singer",
      line1: "456 Oak Ave",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      passwordHash: null,
    });
    expect(saveResult.ok).toBe(true);

    const session = await getCheckoutSession(testDb.db, sessionToken);
    expect(session?.passwordHash).toBeNull();

    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    const orderResult = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) throw new Error("Order creation failed");

    expect(orderResult.isNewAccount).toBe(true);
    expect(orderResult.hasPassword).toBe(false);

    const [createdAccount] = await testDb.db
      .select()
      .from(account)
      .where(eq(account.id, orderResult.accountId));
    expect(createdAccount.passwordHash).toBeNull();

    const orderDetails = await getOrderByReference(testDb.db, orderResult.order.reference);
    expect(orderDetails?.hasPassword).toBe(false);
  });

  it("Scenario 3: subsequent checkout with password updates existing passwordless account", async () => {
    const email = "upgrade.account@example.com";

    // 1. Initial checkout without password
    const session1 = randomUUID();
    await addVariantToCart(testDb.db, session1, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, session1, {
      email,
      recipientName: "Charlie Brown",
      line1: "789 Pine Rd",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    });
    await saveCheckoutShippingMethod(testDb.db, session1, standardMethod.id);
    const order1 = await createPaidOrderFromCheckout(testDb.db, session1);
    expect(order1.ok).toBe(true);
    if (!order1.ok) throw new Error("Order 1 failed");
    expect(order1.hasPassword).toBe(false);

    const accountId = order1.accountId;

    // 2. Second checkout with password
    const session2 = randomUUID();
    const newPassword = "NewAccountPassword123";
    const newPasswordHash = await hashPassword(newPassword);

    await addVariantToCart(testDb.db, session2, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, session2, {
      email,
      recipientName: "Charlie Brown",
      line1: "789 Pine Rd",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      passwordHash: newPasswordHash,
    });
    await saveCheckoutShippingMethod(testDb.db, session2, standardMethod.id);

    const order2 = await createPaidOrderFromCheckout(testDb.db, session2);
    expect(order2.ok).toBe(true);
    if (!order2.ok) throw new Error("Order 2 failed");

    expect(order2.isNewAccount).toBe(false);
    expect(order2.accountId).toBe(accountId);
    expect(order2.hasPassword).toBe(true);

    // Verify existing account was updated
    const [updatedAccount] = await testDb.db
      .select()
      .from(account)
      .where(eq(account.id, accountId));
    expect(updatedAccount.passwordHash).toBe(newPasswordHash);
    expect(await verifyPassword(newPassword, updatedAccount.passwordHash!)).toBe(true);
  });

  it("Scenario 4: subsequent checkout without password preserves existing password", async () => {
    const email = "keep.password@example.com";
    const initialPassword = "OriginalSecret999";
    const initialPasswordHash = await hashPassword(initialPassword);

    // 1. Initial checkout with password
    const session1 = randomUUID();
    await addVariantToCart(testDb.db, session1, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, session1, {
      email,
      recipientName: "Dana Scully",
      line1: "101 FBI Blvd",
      city: "Washington",
      state: "DC",
      zip: "20001",
      passwordHash: initialPasswordHash,
    });
    await saveCheckoutShippingMethod(testDb.db, session1, standardMethod.id);
    const order1 = await createPaidOrderFromCheckout(testDb.db, session1);
    expect(order1.ok).toBe(true);
    if (!order1.ok) throw new Error("Order 1 failed");

    // 2. Subsequent checkout without password
    const session2 = randomUUID();
    await addVariantToCart(testDb.db, session2, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, session2, {
      email,
      recipientName: "Dana Scully",
      line1: "101 FBI Blvd",
      city: "Washington",
      state: "DC",
      zip: "20001",
      passwordHash: null,
    });
    await saveCheckoutShippingMethod(testDb.db, session2, standardMethod.id);
    const order2 = await createPaidOrderFromCheckout(testDb.db, session2);
    expect(order2.ok).toBe(true);
    if (!order2.ok) throw new Error("Order 2 failed");

    expect(order2.hasPassword).toBe(true);

    // Verify password was NOT wiped
    const [acc] = await testDb.db
      .select()
      .from(account)
      .where(eq(account.id, order1.accountId));
    expect(acc.passwordHash).toBe(initialPasswordHash);
    expect(await verifyPassword(initialPassword, acc.passwordHash!)).toBe(true);
  });
});
