import { cookies } from "next/headers";

export const ACCOUNT_SESSION_COOKIE = "ja_account_session";
export const ACCOUNT_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days = 2,592,000 seconds

export interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
  set(options: {
    name: string;
    value: string;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none" | boolean;
    secure?: boolean;
    path?: string;
    maxAge?: number;
  }): void;
  delete?(name: string): void;
}

/**
 * Returns the account session token from cookies, or undefined.
 */
export async function getAccountSessionToken(
  cookieStore?: CookieStoreLike,
): Promise<string | undefined> {
  const store = cookieStore ?? (await cookies());
  const value = store.get(ACCOUNT_SESSION_COOKIE)?.value;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * Persists an account session token into the `ja_account_session` cookie.
 * Supports both signatures: `setAccountSessionCookie(cookieStore, token)` and `setAccountSessionCookie(token)`.
 */
export async function setAccountSessionCookie(
  cookieStoreOrToken: CookieStoreLike | string,
  maybeToken?: string,
): Promise<void> {
  let store: CookieStoreLike;
  let token: string;

  if (typeof cookieStoreOrToken === "string") {
    store = await cookies();
    token = cookieStoreOrToken;
  } else {
    store = cookieStoreOrToken;
    token = maybeToken ?? "";
  }

  store.set({
    name: ACCOUNT_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCOUNT_SESSION_MAX_AGE,
  });
}

/**
 * Clears the `ja_account_session` cookie.
 */
export async function clearAccountSessionCookie(
  cookieStore?: CookieStoreLike,
): Promise<void> {
  const store = cookieStore ?? (await cookies());
  store.set({
    name: ACCOUNT_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  if (typeof store.delete === "function") {
    store.delete(ACCOUNT_SESSION_COOKIE);
  }
}
