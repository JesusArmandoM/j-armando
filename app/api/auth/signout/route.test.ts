// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "ja_account_session" && cookieState.value !== undefined
        ? { name, value: cookieState.value }
        : undefined,
    set: cookieState.set,
    delete: cookieState.delete,
  })),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/auth.ts", () => ({
  revokeAccountSession: vi.fn(),
}));

import { revokeAccountSession } from "@/db/auth.ts";
import { POST } from "./route.ts";

const revokeAccountSessionMock = vi.mocked(revokeAccountSession);

describe("POST /api/auth/signout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("revokes session in db and clears account session cookie", async () => {
    cookieState.value = "active_session_token_123";
    revokeAccountSessionMock.mockResolvedValueOnce(true);

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(revokeAccountSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      "active_session_token_123",
    );
    expect(cookieState.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ja_account_session",
        value: "",
        maxAge: 0,
      }),
    );
  });

  it("clears cookie gracefully even if no session token was present", async () => {
    cookieState.value = undefined;

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(revokeAccountSessionMock).not.toHaveBeenCalled();
    expect(cookieState.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ja_account_session",
        value: "",
        maxAge: 0,
      }),
    );
  });
});
