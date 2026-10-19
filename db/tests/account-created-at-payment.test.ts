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
import { createPaidOrderFromCheckout, getOrderByReference } from "../order.ts";
import type { ShippingMethod } from "../schema/index.ts";
import { account, accountRole, address, cart, order } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("account created at payment (db/order.ts)", () => {
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

  it("Scenario 1: first-time email creates new account with role 'customer' and links order, address, and cart", async () => {
    const sessionToken = randomUUID();
    const email = "first.buyer@example.com";

    // 1. Setup active cart with items, contact & address, and shipping method
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email,
      recipientName: "First Buyer",
      line1: "100 Broadway",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken, standardMethod.id);

    // 2. Execute order creation on payment
    const result = await createPaidOrderFromCheckout(testDb.db, sessionToken);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Order creation failed");

    expect(result.isNewAccount).toBe(true);
    expect(result.accountId).toBeTruthy();
    expect(result.order.accountId).toBe(result.accountId);
    expect(result.order.contactEmail).toBe("first.buyer@example.com");

    const accountId = result.accountId;

    // 3. Verify exactly one account was created with normalized email
    const accounts = await testDb.db
      .select()
      .from(account)
      .where(eq(account.email, "first.buyer@example.com"));
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(accountId);
    expect(accounts[0].email).toBe("first.buyer@example.com");

    // 4. Verify accountRole has role 'customer'
    const roles = await testDb.db
      .select()
      .from(accountRole)
      .where(eq(accountRole.accountId, accountId));
    expect(roles).toHaveLength(1);
    expect(roles[0].role).toBe("customer");

    // 5. Verify created order is linked to accountId
    const [createdOrderRow] = await testDb.db
      .select()
      .from(order)
      .where(eq(order.reference, result.order.reference));
    expect(createdOrderRow.accountId).toBe(accountId);

    // 6. Verify shipping address is linked to accountId
    const [addressRow] = await testDb.db
      .select()
      .from(address)
      .where(eq(address.id, createdOrderRow.addressId));
    expect(addressRow.accountId).toBe(accountId);

    // 7. Verify cart is linked to accountId and converted
    const [cartRow] = await testDb.db
      .select()
      .from(cart)
      .where(eq(cart.sessionToken, sessionToken));
    expect(cartRow.accountId).toBe(accountId);
    expect(cartRow.status).toBe("converted");

    // 8. Verify getOrderByReference returns accountId and isNewAccount = true
    const orderDetails = await getOrderByReference(testDb.db, result.order.reference);
    expect(orderDetails?.accountId).toBe(accountId);
    expect(orderDetails?.isNewAccount).toBe(true);
  });

  it("Scenario 2: repeat purchase with existing email attaches to existing account without duplicate account creation", async () => {
    // 1. First purchase creates the account
    const email = "returning.customer@example.com";
    const sessionToken1 = randomUUID();

    await addVariantToCart(testDb.db, sessionToken1, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken1, {
      email,
      recipientName: "Returning Customer",
      line1: "200 Fifth Ave",
      city: "New York",
      state: "NY",
      zip: "10010",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken1, standardMethod.id);

    const firstOrderResult = await createPaidOrderFromCheckout(testDb.db, sessionToken1);
    expect(firstOrderResult.ok).toBe(true);
    if (!firstOrderResult.ok) throw new Error("First order failed");
    expect(firstOrderResult.isNewAccount).toBe(true);
    const existingAccountId = firstOrderResult.accountId;

    // 2. Second purchase with the exact same email
    const sessionToken2 = randomUUID();
    await addVariantToCart(testDb.db, sessionToken2, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken2, {
      email,
      recipientName: "Returning Customer Again",
      line1: "200 Fifth Ave",
      city: "New York",
      state: "NY",
      zip: "10010",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken2, standardMethod.id);

    const secondOrderResult = await createPaidOrderFromCheckout(testDb.db, sessionToken2);
    expect(secondOrderResult.ok).toBe(true);
    if (!secondOrderResult.ok) throw new Error("Second order failed");

    // Must reuse existing account
    expect(secondOrderResult.isNewAccount).toBe(false);
    expect(secondOrderResult.accountId).toBe(existingAccountId);
    expect(secondOrderResult.order.accountId).toBe(existingAccountId);

    // 3. Verify exactly one account exists in the database for this email
    const accounts = await testDb.db
      .select()
      .from(account)
      .where(eq(account.email, email));
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(existingAccountId);

    // 4. Verify accountRole still has exactly one role row
    const roles = await testDb.db
      .select()
      .from(accountRole)
      .where(eq(accountRole.accountId, existingAccountId));
    expect(roles).toHaveLength(1);

    // 5. Verify the second order is attached to the existing account
    const [secondOrderRow] = await testDb.db
      .select()
      .from(order)
      .where(eq(order.reference, secondOrderResult.order.reference));
    expect(secondOrderRow.accountId).toBe(existingAccountId);

    // 6. Verify getOrderByReference returns isNewAccount = false for the second order
    const orderDetails = await getOrderByReference(testDb.db, secondOrderResult.order.reference);
    expect(orderDetails?.accountId).toBe(existingAccountId);
    expect(orderDetails?.isNewAccount).toBe(false);
  });

  it("Scenario 3: email normalization trims whitespace and downcases, linking mixed-case repeat purchases", async () => {
    const rawEmail1 = "  MixedCase.User@Example.COM  ";
    const rawEmail2 = "mixedcase.user@EXAMPLE.com";
    const normalized = "mixedcase.user@example.com";

    // 1. Order 1 with uppercase and whitespace
    const sessionToken1 = randomUUID();
    await addVariantToCart(testDb.db, sessionToken1, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken1, {
      email: rawEmail1,
      recipientName: "Case Tester",
      line1: "300 Madison Ave",
      city: "New York",
      state: "NY",
      zip: "10017",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken1, standardMethod.id);

    const result1 = await createPaidOrderFromCheckout(testDb.db, sessionToken1);
    expect(result1.ok).toBe(true);
    if (!result1.ok) throw new Error("Order 1 failed");
    expect(result1.isNewAccount).toBe(true);

    const accountId = result1.accountId;

    // Verify account stored with lowercase email
    const [storedAccount] = await testDb.db
      .select()
      .from(account)
      .where(eq(account.id, accountId));
    expect(storedAccount.email).toBe(normalized);

    // 2. Order 2 with differently cased email
    const sessionToken2 = randomUUID();
    await addVariantToCart(testDb.db, sessionToken2, variantId, 1);
    await saveCheckoutContactAndAddress(testDb.db, sessionToken2, {
      email: rawEmail2,
      recipientName: "Case Tester",
      line1: "300 Madison Ave",
      city: "New York",
      state: "NY",
      zip: "10017",
    });
    await saveCheckoutShippingMethod(testDb.db, sessionToken2, standardMethod.id);

    const result2 = await createPaidOrderFromCheckout(testDb.db, sessionToken2);
    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error("Order 2 failed");

    // Both orders link to the exact same account
    expect(result2.isNewAccount).toBe(false);
    expect(result2.accountId).toBe(accountId);

    // Still only 1 account in table
    const accounts = await testDb.db
      .select()
      .from(account)
      .where(eq(account.email, normalized));
    expect(accounts).toHaveLength(1);
  });

  it("Scenario 4: check constraint chk_account_email_lowercase rejects uppercase email inserts", async () => {
    let error: unknown;
    try {
      await testDb.db.insert(account).values({
        email: "UppercaseCheck@Example.com",
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    // PostgreSQL error details in error.cause or constraint property
    const pgError = error as {
      constraint?: string;
      cause?: { constraint?: string; message?: string };
      message?: string;
    };
    const constraintName = pgError.cause?.constraint ?? pgError.constraint ?? "";
    const fullMessage = `${pgError.message ?? ""} ${pgError.cause?.message ?? ""}`;
    expect(constraintName === "chk_account_email_lowercase" || /chk_account_email_lowercase/i.test(fullMessage)).toBe(true);
  });
});
