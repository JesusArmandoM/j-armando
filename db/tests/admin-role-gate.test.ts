import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "../../lib/auth/password.ts";
import { getAdminSession } from "../../lib/auth/admin-guard.ts";
import {
  authenticateWithPassword,
  createAccountSession,
  grantAdminRole,
  revokeAdminRole,
} from "../auth.ts";
import { account, accountRole } from "../schema/index.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("admin role gate (db/auth.ts and lib/auth/admin-guard.ts)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("Scenario 1: Authenticated admin account is authorized to open the backoffice", async () => {
    const email = "store.admin@example.com";
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);

    const [created] = await testDb.db
      .insert(account)
      .values({
        email,
        passwordHash,
      })
      .returning();

    // Assign customer and admin roles
    await testDb.db.insert(accountRole).values([
      { accountId: created.id, role: "customer" },
      { accountId: created.id, role: "admin" },
    ]);

    const authResult = await authenticateWithPassword(testDb.db, email, password);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) throw new Error("Expected auth success");
    expect(authResult.roles).toContain("admin");

    const session = await createAccountSession(testDb.db, created.id);
    const cookieStore = {
      get: (name: string) =>
        name === "ja_account_session" ? { value: session.sessionToken } : undefined,
      set: () => {},
    };

    const adminSession = await getAdminSession(cookieStore, testDb.db);
    expect(adminSession.status).toBe("authorized");
    if (adminSession.status !== "authorized") throw new Error("Expected authorized");
    expect(adminSession.account.id).toBe(created.id);
    expect(adminSession.account.email).toBe(email);
    expect(adminSession.roles).toContain("admin");
  });

  it("Scenario 2: Customer account without admin role is forbidden from backoffice", async () => {
    const email = "standard.customer@example.com";
    const password = "CustomerPassword123!";
    const passwordHash = await hashPassword(password);

    const [created] = await testDb.db
      .insert(account)
      .values({
        email,
        passwordHash,
      })
      .returning();

    // Assign customer role only
    await testDb.db.insert(accountRole).values({
      accountId: created.id,
      role: "customer",
    });

    const session = await createAccountSession(testDb.db, created.id);
    const cookieStore = {
      get: (name: string) =>
        name === "ja_account_session" ? { value: session.sessionToken } : undefined,
      set: () => {},
    };

    const adminSession = await getAdminSession(cookieStore, testDb.db);
    expect(adminSession.status).toBe("forbidden");
    if (adminSession.status !== "forbidden") throw new Error("Expected forbidden");
    expect(adminSession.account.email).toBe(email);
    expect(adminSession.roles).toEqual(["customer"]);
  });

  it("Scenario 3: Signed-out visitor is unauthenticated", async () => {
    const emptyCookieStore = {
      get: () => undefined,
      set: () => {},
    };

    const adminSession = await getAdminSession(emptyCookieStore, testDb.db);
    expect(adminSession.status).toBe("unauthenticated");
  });

  it("Scenario 5: Revoking admin role removes backoffice access immediately on next request", async () => {
    const email = "revoked.admin@example.com";
    const [created] = await testDb.db
      .insert(account)
      .values({ email })
      .returning();

    await testDb.db.insert(accountRole).values([
      { accountId: created.id, role: "customer" },
      { accountId: created.id, role: "admin" },
    ]);

    const session = await createAccountSession(testDb.db, created.id);
    const cookieStore = {
      get: (name: string) =>
        name === "ja_account_session" ? { value: session.sessionToken } : undefined,
      set: () => {},
    };

    // 1. Initial request: Authorized
    const firstCheck = await getAdminSession(cookieStore, testDb.db);
    expect(firstCheck.status).toBe("authorized");

    // 2. Revoke admin role
    const revoked = await revokeAdminRole(testDb.db, created.id);
    expect(revoked).toBe(true);

    // 3. Subsequent request immediately returns forbidden without session expiry
    const secondCheck = await getAdminSession(cookieStore, testDb.db);
    expect(secondCheck.status).toBe("forbidden");
    if (secondCheck.status !== "forbidden") throw new Error("Expected forbidden");
    expect(secondCheck.roles).toEqual(["customer"]);

    // 4. Grant admin role back
    const granted = await grantAdminRole(testDb.db, created.id);
    expect(granted).toBe(true);

    // 5. Subsequent request immediately returns authorized again
    const thirdCheck = await getAdminSession(cookieStore, testDb.db);
    expect(thirdCheck.status).toBe("authorized");
  });

  it("seedCatalog seeds the default admin account with customer and admin roles", async () => {
    await seedCatalog(testDb.db);

    const authResult = await authenticateWithPassword(
      testDb.db,
      "admin@j-armando.store",
      "Admin123!",
    );

    expect(authResult.ok).toBe(true);
    if (!authResult.ok) throw new Error("Expected seed admin auth success");
    expect(authResult.roles).toContain("admin");
    expect(authResult.roles).toContain("customer");
  });
});
