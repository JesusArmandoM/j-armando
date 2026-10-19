import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

// Server-only guest-cart identity. The opaque cookie value is the only cart
// credential: the cart id, line ids and session token are never accepted from
// the request body or query string. `cookies()` is async in Next.js 16 and
// `.set` is only allowed in Route Handlers / Server Functions, never during
// Server Component rendering, so reads use `readCartSessionToken` only.

export const CART_SESSION_COOKIE = "ja_cart_session";

/** 30 days, in seconds. */
const CART_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** Returns the existing trimmed session token, or undefined. Never sets one. */
export async function readCartSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get(CART_SESSION_COOKIE)?.value;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * Generates a new opaque session token (32 random bytes, base64url) **without**
 * touching cookies. The add route generates a token in memory, attempts the
 * write, and only persists it via `setCartSessionCookie` after a successful
 * add — so rejected requests never receive an identity cookie.
 */
export function createCartSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Persists an already-generated token as an httpOnly, same-site cookie. Only
 * the add route calls this, and only when the add succeeded and the request
 * arrived without an existing session token.
 */
export async function setCartSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: CART_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_SESSION_MAX_AGE,
  });
}
