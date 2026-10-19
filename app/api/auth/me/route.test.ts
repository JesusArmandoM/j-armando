// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "ja_account_session" && cookieState.value !== undefined
        ? { name, value: cookieState.value }
        : undefined,
  })),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/auth.ts", () => ({
  getAccountFromSessionToken: vi.fn(),
}));

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { GET } from "./route.ts";

const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("returns authenticated: false when no session cookie exists", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authenticated).toBe(false);
  });

  it("returns authenticated: false when session is invalid or expired", async () => {
    cookieState.value = "invalid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authenticated).toBe(false);
  });

  it("returns authenticated: true with account details and roles for active session", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-789",
        email: "member@example.com",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
      session: {
        id: "sess-3",
        accountId: "acc-789",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.account).toEqual({
      id: "acc-789",
      email: "member@example.com",
    });
    expect(data.roles).toEqual(["customer", "admin"]);
  });
});
