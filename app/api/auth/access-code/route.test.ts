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
  requestPasswordlessAccessCode: vi.fn(),
  verifyPasswordlessAccessCode: vi.fn(),
  createAccountSession: vi.fn(),
}));

import {
  createAccountSession,
  requestPasswordlessAccessCode,
  verifyPasswordlessAccessCode,
} from "@/db/auth.ts";
import { POST as requestCodePost } from "../request-code/route.ts";
import { POST as verifyCodePost } from "../verify-code/route.ts";

const requestCodeMock = vi.mocked(requestPasswordlessAccessCode);
const verifyCodeMock = vi.mocked(verifyPasswordlessAccessCode);
const createAccountSessionMock = vi.mocked(createAccountSession);

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/request-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing or empty", async () => {
    const res = await requestCodePost(
      jsonRequest("http://localhost/api/auth/request-code", { email: "" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email is required.");
  });

  it("returns 404 when account does not exist", async () => {
    requestCodeMock.mockResolvedValueOnce({
      ok: false,
      error: "account_not_found",
    });

    const res = await requestCodePost(
      jsonRequest("http://localhost/api/auth/request-code", {
        email: "unknown@example.com",
      }),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("No account found with this email.");
  });

  it("returns 200 when access code is requested successfully", async () => {
    requestCodeMock.mockResolvedValueOnce({ ok: true });

    const res = await requestCodePost(
      jsonRequest("http://localhost/api/auth/request-code", {
        email: "user@example.com",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe("POST /api/auth/verify-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("returns 400 when code or email is missing", async () => {
    const res = await verifyCodePost(
      jsonRequest("http://localhost/api/auth/verify-code", { email: "u@example.com", code: "" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email and access code are required.");
  });

  it("returns 400 when code is invalid or expired", async () => {
    verifyCodeMock.mockResolvedValueOnce({
      ok: false,
      error: "invalid_code",
    });

    const res = await verifyCodePost(
      jsonRequest("http://localhost/api/auth/verify-code", {
        email: "user@example.com",
        code: "999999",
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid or expired access code.");
    expect(cookieState.set).not.toHaveBeenCalled();
  });

  it("authenticates valid access code, establishes session cookie, and returns account", async () => {
    verifyCodeMock.mockResolvedValueOnce({
      ok: true,
      account: {
        id: "acc-456",
        email: "user@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    createAccountSessionMock.mockResolvedValueOnce({
      id: "sess-2",
      accountId: "acc-456",
      sessionToken: "verified_session_token_xyz",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const res = await verifyCodePost(
      jsonRequest("http://localhost/api/auth/verify-code", {
        email: "user@example.com",
        code: "123456",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.account).toEqual({
      id: "acc-456",
      email: "user@example.com",
    });

    expect(cookieState.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ja_account_session",
        value: "verified_session_token_xyz",
        httpOnly: true,
      }),
    );
  });
});
