// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "ja_account_session" && cookieState.value !== undefined
        ? { name, value: cookieState.value }
        : undefined,
    set: cookieState.set,
  })),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/auth.ts", () => ({
  authenticateWithPassword: vi.fn(),
  createAccountSession: vi.fn(),
}));

import { authenticateWithPassword, createAccountSession } from "@/db/auth.ts";
import { POST } from "./route.ts";

const authenticateWithPasswordMock = vi.mocked(authenticateWithPassword);
const createAccountSessionMock = vi.mocked(createAccountSession);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("rejects non-JSON requests with 400", async () => {
    const req = new Request("http://localhost/api/auth/signin", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Request body must be JSON.");
  });

  it("rejects invalid or missing credentials with 400", async () => {
    const res = await POST(jsonRequest({ email: "", password: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid email or password.");
  });

  it("returns 401 when password authentication fails", async () => {
    authenticateWithPasswordMock.mockResolvedValueOnce({
      ok: false,
      error: "invalid_credentials",
    });

    const res = await POST(
      jsonRequest({ email: "user@example.com", password: "WrongPassword" }),
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Invalid email or password.");
    expect(cookieState.set).not.toHaveBeenCalled();
  });

  it("authenticates valid credentials, sets session cookie, and returns account info", async () => {
    authenticateWithPasswordMock.mockResolvedValueOnce({
      ok: true,
      account: {
        id: "acc-123",
        email: "user@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    createAccountSessionMock.mockResolvedValueOnce({
      id: "sess-1",
      accountId: "acc-123",
      sessionToken: "opaque_token_abc_123",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const res = await POST(
      jsonRequest({ email: "user@example.com", password: "CorrectPassword123!" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.account).toEqual({
      id: "acc-123",
      email: "user@example.com",
    });

    expect(cookieState.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ja_account_session",
        value: "opaque_token_abc_123",
        httpOnly: true,
        sameSite: "lax",
      }),
    );
  });
});
