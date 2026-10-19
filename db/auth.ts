import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { Db } from "./client.ts";
import { account, accountAccessCode, accountRole, accountSession } from "./schema/index.ts";
import type { AccountSession } from "./schema/index.ts";
import { verifyPassword } from "@/lib/auth/password.ts";
import type { AccessCodeEmailSender } from "@/lib/email/access-code.ts";
import { getAccessCodeEmailSender } from "@/lib/email/access-code.ts";

export interface AuthenticatedAccount {
  id: string;
  email: string;
  createdAt: Date;
}

export type AuthResult =
  | { ok: true; account: AuthenticatedAccount; roles: string[] }
  | {
      ok: false;
      error: "invalid_credentials" | "account_not_found" | "invalid_code" | "expired_code";
    };

/**
 * Verifies email and password against stored scrypt hash.
 * Accounts without a password (quick access) or invalid passwords return invalid_credentials.
 */
export async function authenticateWithPassword(
  db: Db,
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { ok: false, error: "invalid_credentials" };
  }

  const [existingAccount] = await db
    .select()
    .from(account)
    .where(eq(account.email, normalizedEmail))
    .limit(1);

  if (!existingAccount || !existingAccount.passwordHash) {
    return { ok: false, error: "invalid_credentials" };
  }

  const matches = await verifyPassword(password, existingAccount.passwordHash);
  if (!matches) {
    return { ok: false, error: "invalid_credentials" };
  }

  const roleRows = await db
    .select()
    .from(accountRole)
    .where(eq(accountRole.accountId, existingAccount.id));

  return {
    ok: true,
    account: {
      id: existingAccount.id,
      email: existingAccount.email,
      createdAt: existingAccount.createdAt,
    },
    roles: roleRows.map((r) => r.role),
  };
}

/**
 * Creates a new persistent account session with an opaque 32-byte base64url token.
 * Defaults to 30 days time-to-live.
 */
export async function createAccountSession(
  db: Db,
  accountId: string,
  ttlDays = 30,
): Promise<AccountSession> {
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const [session] = await db
    .insert(accountSession)
    .values({
      accountId,
      sessionToken,
      expiresAt,
    })
    .returning();

  return session;
}

/**
 * Resolves an authenticated account from an opaque session token.
 * Returns null if the token does not exist, has expired, or the account no longer exists.
 */
export async function getAccountFromSessionToken(
  db: Db,
  sessionToken: string,
): Promise<{ account: AuthenticatedAccount; roles: string[]; session: AccountSession } | null> {
  if (!sessionToken || !sessionToken.trim()) {
    return null;
  }

  const [session] = await db
    .select()
    .from(accountSession)
    .where(eq(accountSession.sessionToken, sessionToken.trim()))
    .limit(1);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    return null;
  }

  const [acc] = await db
    .select()
    .from(account)
    .where(eq(account.id, session.accountId))
    .limit(1);

  if (!acc) {
    return null;
  }

  const roleRows = await db
    .select()
    .from(accountRole)
    .where(eq(accountRole.accountId, acc.id));

  return {
    account: {
      id: acc.id,
      email: acc.email,
      createdAt: acc.createdAt,
    },
    roles: roleRows.map((r) => r.role),
    session,
  };
}

/**
 * Revokes a session token by deleting its row from account_session.
 */
export async function revokeAccountSession(
  db: Db,
  sessionToken: string,
): Promise<boolean> {
  if (!sessionToken || !sessionToken.trim()) {
    return false;
  }

  const result = await db
    .delete(accountSession)
    .where(eq(accountSession.sessionToken, sessionToken.trim()))
    .returning({ id: accountSession.id });

  return result.length > 0;
}

/**
 * Generates and emails a 6-digit numeric OTP access code for passwordless sign-in.
 * Access codes expire after 15 minutes.
 */
export async function requestPasswordlessAccessCode(
  db: Db,
  email: string,
  emailSender?: AccessCodeEmailSender,
): Promise<{ ok: true } | { ok: false; error: "account_not_found" }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, error: "account_not_found" };
  }

  const [acc] = await db
    .select()
    .from(account)
    .where(eq(account.email, normalizedEmail))
    .limit(1);

  if (!acc) {
    return { ok: false, error: "account_not_found" };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // Clean up any existing access codes for this account
  await db
    .delete(accountAccessCode)
    .where(eq(accountAccessCode.accountId, acc.id));

  await db.insert(accountAccessCode).values({
    accountId: acc.id,
    code,
    expiresAt,
  });

  const sender = emailSender ?? getAccessCodeEmailSender();
  await sender.sendAccessCode({
    to: acc.email,
    code,
    expiresMinutes: 15,
  });

  return { ok: true };
}

/**
 * Verifies an OTP access code for an account.
 * On success, deletes the code so it cannot be reused.
 */
export async function verifyPasswordlessAccessCode(
  db: Db,
  email: string,
  code: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  if (!normalizedEmail || !trimmedCode) {
    return { ok: false, error: "invalid_code" };
  }

  const [acc] = await db
    .select()
    .from(account)
    .where(eq(account.email, normalizedEmail))
    .limit(1);

  if (!acc) {
    return { ok: false, error: "account_not_found" };
  }

  const [accessCodeRow] = await db
    .select()
    .from(accountAccessCode)
    .where(
      and(
        eq(accountAccessCode.accountId, acc.id),
        eq(accountAccessCode.code, trimmedCode),
      ),
    )
    .limit(1);

  if (!accessCodeRow) {
    return { ok: false, error: "invalid_code" };
  }

  if (accessCodeRow.expiresAt <= new Date()) {
    return { ok: false, error: "expired_code" };
  }

  // Delete used code on success
  await db
    .delete(accountAccessCode)
    .where(eq(accountAccessCode.id, accessCodeRow.id));

  const roleRows = await db
    .select()
    .from(accountRole)
    .where(eq(accountRole.accountId, acc.id));

  return {
    ok: true,
    account: {
      id: acc.id,
      email: acc.email,
      createdAt: acc.createdAt,
    },
    roles: roleRows.map((r) => r.role),
  };
}

/**
 * Grants the admin role to an account (idempotent).
 */
export async function grantAdminRole(db: Db, accountId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(accountRole)
    .where(and(eq(accountRole.accountId, accountId), eq(accountRole.role, "admin")))
    .limit(1);

  if (existing) {
    return true;
  }

  await db
    .insert(accountRole)
    .values({
      accountId,
      role: "admin",
    })
    .onConflictDoNothing({ target: [accountRole.accountId, accountRole.role] });

  return true;
}

/**
 * Revokes the admin role from an account.
 * Immediately takes effect on subsequent getAccountFromSessionToken or getAdminSession calls.
 */
export async function revokeAdminRole(db: Db, accountId: string): Promise<boolean> {
  const result = await db
    .delete(accountRole)
    .where(and(eq(accountRole.accountId, accountId), eq(accountRole.role, "admin")))
    .returning({ id: accountRole.id });

  return result.length > 0;
}

