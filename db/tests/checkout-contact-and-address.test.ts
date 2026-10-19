import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addVariantToCart } from "../cart.ts";
import { getPublishedProductBySlug } from "../catalog.ts";
import { getCheckoutSession, saveCheckoutContactAndAddress } from "../checkout.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("checkout contact and address data access", () => {
  let testDb: TestDatabase;
  let variantId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);

    const blazer = await getPublishedProductBySlug(testDb.db, "double-breasted-linen-blazer");
    if (!blazer || blazer.variants.length === 0) {
      throw new Error("expected seeded blazer with variants");
    }
    variantId = blazer.variants[0].id;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("returns cart_not_found when attempting to save checkout without an active cart", async () => {
    const sessionToken = randomUUID();
    const result = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "test@example.com",
      recipientName: "Jane Doe",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
    });

    expect(result).toEqual({ ok: false, reason: "cart_not_found" });
  });

  it("returns undefined when no checkout session exists for a session token", async () => {
    const sessionToken = randomUUID();
    const session = await getCheckoutSession(testDb.db, sessionToken);
    expect(session).toBeUndefined();
  });

  it("saves contact and address for an active cart and allows retrieval", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);

    const saveResult = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "Alexandra.Vance@Studio.com",
      recipientName: "Alexandra Vance",
      line1: "123 Main Street",
      line2: "Apt 4B",
      city: "New York",
      state: "ny",
      zip: "10001",
      phone: "+1 555-019-2834",
    });

    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) return;

    expect(saveResult.checkoutSession.email).toBe("alexandra.vance@studio.com");
    expect(saveResult.checkoutSession.recipientName).toBe("Alexandra Vance");
    expect(saveResult.checkoutSession.line1).toBe("123 Main Street");
    expect(saveResult.checkoutSession.line2).toBe("Apt 4B");
    expect(saveResult.checkoutSession.city).toBe("New York");
    expect(saveResult.checkoutSession.state).toBe("NY");
    expect(saveResult.checkoutSession.zip).toBe("10001");
    expect(saveResult.checkoutSession.country).toBe("US");
    expect(saveResult.checkoutSession.phone).toBe("+1 555-019-2834");

    const retrieved = await getCheckoutSession(testDb.db, sessionToken);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(saveResult.checkoutSession.id);
    expect(retrieved?.email).toBe("alexandra.vance@studio.com");
  });

  it("updates existing checkout session on subsequent save (upsert)", async () => {
    const sessionToken = randomUUID();
    await addVariantToCart(testDb.db, sessionToken, variantId, 1);

    const initial = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "first@example.com",
      recipientName: "First Name",
      line1: "100 Old Rd",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const updated = await saveCheckoutContactAndAddress(testDb.db, sessionToken, {
      email: "second@example.com",
      recipientName: "Second Name",
      line1: "200 New Blvd",
      city: "Queens",
      state: "NY",
      zip: "11101",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.checkoutSession.id).toBe(initial.checkoutSession.id);
    expect(updated.checkoutSession.email).toBe("second@example.com");
    expect(updated.checkoutSession.recipientName).toBe("Second Name");
    expect(updated.checkoutSession.line1).toBe("200 New Blvd");
    expect(updated.checkoutSession.city).toBe("Queens");
  });

  it("enforces session isolation across multiple carts", async () => {
    const sessionTokenA = randomUUID();
    const sessionTokenB = randomUUID();
    await addVariantToCart(testDb.db, sessionTokenA, variantId, 1);
    await addVariantToCart(testDb.db, sessionTokenB, variantId, 1);

    await saveCheckoutContactAndAddress(testDb.db, sessionTokenA, {
      email: "user.a@example.com",
      recipientName: "User A",
      line1: "123 A St",
      city: "City A",
      state: "CA",
      zip: "90210",
    });

    const sessionA = await getCheckoutSession(testDb.db, sessionTokenA);
    const sessionB = await getCheckoutSession(testDb.db, sessionTokenB);

    expect(sessionA?.email).toBe("user.a@example.com");
    expect(sessionB).toBeUndefined();
  });
});
