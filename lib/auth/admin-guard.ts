import { getAccountFromSessionToken } from "@/db/auth.ts";
import type { AuthenticatedAccount } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import type { Db } from "@/db/client.ts";
import { getAccountSessionToken } from "./session-cookie.ts";
import type { CookieStoreLike } from "./session-cookie.ts";

export type AdminSessionResult =
  | { status: "unauthenticated" }
  | { status: "forbidden"; account: AuthenticatedAccount; roles: string[] }
  | { status: "authorized"; account: AuthenticatedAccount; roles: string[] };

/**
 * Resolves the authenticated session and verifies the admin role.
 *
 * - Returns `{ status: "unauthenticated" }` if no valid active session exists.
 * - Returns `{ status: "forbidden", account, roles }` if authenticated but lacking the "admin" role.
 * - Returns `{ status: "authorized", account, roles }` if authenticated and holds the "admin" role.
 *
 * Role revocation takes effect immediately on the next call because roles are queried
 * on every session verification without caching.
 */
export async function getAdminSession(
  cookieStore?: CookieStoreLike,
  dbInstance?: Db,
): Promise<AdminSessionResult> {
  const sessionToken = await getAccountSessionToken(cookieStore);
  if (!sessionToken) {
    return { status: "unauthenticated" };
  }

  try {
    const db = dbInstance ?? getDb();
    const authData = await getAccountFromSessionToken(db, sessionToken);
    if (!authData) {
      return { status: "unauthenticated" };
    }

    const { account, roles } = authData;
    if (!roles.includes("admin")) {
      return { status: "forbidden", account, roles };
    }

    return { status: "authorized", account, roles };
  } catch (error) {
    console.error("Admin guard verification error:", error);
    return { status: "unauthenticated" };
  }
}
