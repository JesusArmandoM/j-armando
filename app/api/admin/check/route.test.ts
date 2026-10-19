// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { GET } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);

describe("GET /api/admin/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Authentication required.");
  });

  it("returns 403 when authenticated account lacks admin role", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: {
        id: "cust-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Access denied. Admin role required.");
  });

  it("returns 200 with admin: true when authorized", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.admin).toBe(true);
    expect(data.account.email).toBe("admin@j-armando.store");
    expect(data.roles).toEqual(["customer", "admin"]);
  });
});
