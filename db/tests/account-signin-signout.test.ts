import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../lib/auth/password.ts";
import {
  clearSentAccessCodeEmails,
  getSentAccessCodeEmails,
} from "../../lib/email/access-code.ts";
import {
  authenticateWithPassword,
  createAccountSession,
  getAccountFromSessionToken,
  requestPasswordlessAccessCode,
  revokeAccountSession,
  verifyPasswordlessAccessCode,
} from "../auth.ts";
import { account, accountRole } from "../schema/index.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

describe("account signin and signout (db/auth.ts)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  beforeEach(() => {
    clearSentAccessCodeEmails();
  });

  describe("Scenario 1: Password sign-in success & failure", () => {
    it("authenticates an account with correct password and returns roles", async () => {
      const email = "user.password@example.com";
      const rawPassword = "CorrectPassword123!";
      const passwordHash = await hashPassword(rawPassword);

      const [created] = await testDb.db
        .insert(account)
        .values({
          email,
          passwordHash,
        })
        .returning();

      await testDb.db.insert(accountRole).values({
        accountId: created.id,
        role: "customer",
      });

      // 1. Success with correct password
      const result = await authenticateWithPassword(testDb.db, email, rawPassword);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected auth success");
      expect(result.account.id).toBe(created.id);
      expect(result.account.email).toBe(email);
      expect(result.roles).toEqual(["customer"]);

      // 2. Case-insensitive email matching
      const caseResult = await authenticateWithPassword(
        testDb.db,
        "USER.PASSWORD@EXAMPLE.COM",
        rawPassword,
      );
      expect(caseResult.ok).toBe(true);

      // 3. Failure with wrong password
      const wrongResult = await authenticateWithPassword(
        testDb.db,
        email,
        "WrongPassword123!",
      );
      expect(wrongResult.ok).toBe(false);
      if (wrongResult.ok) throw new Error("Expected auth failure");
      expect(wrongResult.error).toBe("invalid_credentials");

      // 4. Failure with unknown email
      const unknownResult = await authenticateWithPassword(
        testDb.db,
        "nonexistent@example.com",
        rawPassword,
      );
      expect(unknownResult.ok).toBe(false);
      if (unknownResult.ok) throw new Error("Expected auth failure");
      expect(unknownResult.error).toBe("invalid_credentials");
    });

    it("rejects password authentication for passwordless accounts", async () => {
      const email = "passwordless@example.com";
      const [created] = await testDb.db
        .insert(account)
        .values({
          email,
          passwordHash: null,
        })
        .returning();

      await testDb.db.insert(accountRole).values({
        accountId: created.id,
        role: "customer",
      });

      const result = await authenticateWithPassword(testDb.db, email, "SomePassword123!");
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected auth failure");
      expect(result.error).toBe("invalid_credentials");
    });
  });

  describe("Scenario 2: Passwordless OTP request & verification", () => {
    it("requests an access code, emails it, verifies it, and prevents code reuse", async () => {
      const email = "otp.user@example.com";
      const [created] = await testDb.db
        .insert(account)
        .values({
          email,
          passwordHash: null,
        })
        .returning();

      await testDb.db.insert(accountRole).values({
        accountId: created.id,
        role: "customer",
      });

      // 1. Request access code for existing account
      const requestResult = await requestPasswordlessAccessCode(testDb.db, email);
      expect(requestResult.ok).toBe(true);

      // Verify email was sent
      const sent = getSentAccessCodeEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(email);
      const code = sent[0].payload.code;
      expect(code).toMatch(/^\d{6}$/);

      // 2. Reject verification with wrong code
      const wrongVerify = await verifyPasswordlessAccessCode(testDb.db, email, "000000");
      expect(wrongVerify.ok).toBe(false);
      if (wrongVerify.ok) throw new Error("Expected verification failure");
      expect(wrongVerify.error).toBe("invalid_code");

      // 3. Verify successfully with correct code
      const validVerify = await verifyPasswordlessAccessCode(testDb.db, email, code);
      expect(validVerify.ok).toBe(true);
      if (!validVerify.ok) throw new Error("Expected verification success");
      expect(validVerify.account.id).toBe(created.id);
      expect(validVerify.account.email).toBe(email);
      expect(validVerify.roles).toEqual(["customer"]);

      // 4. Code is single-use: verifying again fails
      const replayVerify = await verifyPasswordlessAccessCode(testDb.db, email, code);
      expect(replayVerify.ok).toBe(false);
      if (replayVerify.ok) throw new Error("Expected replay failure");
      expect(replayVerify.error).toBe("invalid_code");
    });

    it("returns account_not_found when requesting an access code for an unknown email", async () => {
      const result = await requestPasswordlessAccessCode(
        testDb.db,
        "does.not.exist@example.com",
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected request failure");
      expect(result.error).toBe("account_not_found");
      expect(getSentAccessCodeEmails()).toHaveLength(0);
    });
  });

  describe("Scenario 3: Session persistence, retrieval, and expiration", () => {
    it("creates a session, retrieves account details, and rejects expired sessions", async () => {
      const email = "session.user@example.com";
      const [created] = await testDb.db
        .insert(account)
        .values({
          email,
          passwordHash: null,
        })
        .returning();

      await testDb.db.insert(accountRole).values({
        accountId: created.id,
        role: "customer",
      });

      // 1. Create session
      const session = await createAccountSession(testDb.db, created.id, 30);
      expect(session.sessionToken).toBeTruthy();
      expect(session.accountId).toBe(created.id);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // 2. Retrieve session
      const retrieved = await getAccountFromSessionToken(testDb.db, session.sessionToken);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.account.id).toBe(created.id);
      expect(retrieved?.account.email).toBe(email);
      expect(retrieved?.roles).toEqual(["customer"]);

      // 3. Expired session returns null
      const expiredSession = await createAccountSession(testDb.db, created.id, -1);
      const expiredRetrieved = await getAccountFromSessionToken(
        testDb.db,
        expiredSession.sessionToken,
      );
      expect(expiredRetrieved).toBeNull();
    });
  });

  describe("Scenario 4: Sign out revokes session", () => {
    it("revokes session so protected content is no longer reachable", async () => {
      const email = "signout.user@example.com";
      const [created] = await testDb.db
        .insert(account)
        .values({
          email,
          passwordHash: null,
        })
        .returning();

      const session = await createAccountSession(testDb.db, created.id, 30);

      // Confirm session is active
      const beforeRevoke = await getAccountFromSessionToken(testDb.db, session.sessionToken);
      expect(beforeRevoke).not.toBeNull();

      // Revoke session
      const revoked = await revokeAccountSession(testDb.db, session.sessionToken);
      expect(revoked).toBe(true);

      // Confirm session no longer exists
      const afterRevoke = await getAccountFromSessionToken(testDb.db, session.sessionToken);
      expect(afterRevoke).toBeNull();

      // Subsequent revoke returns false (already revoked)
      const repeatRevoke = await revokeAccountSession(testDb.db, session.sessionToken);
      expect(repeatRevoke).toBe(false);
    });
  });
});
