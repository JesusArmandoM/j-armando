// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-orders.ts", () => ({
  listAllOrdersForAdmin: vi.fn(),
}));

import { listAllOrdersForAdmin } from "@/db/admin-orders.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { GET } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);
const listAllOrdersForAdminMock = vi.mocked(listAllOrdersForAdmin);

describe("GET /api/admin/orders", () => {
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
    expect(listAllOrdersForAdminMock).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated customer lacks admin role", async () => {
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
    expect(listAllOrdersForAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 with all orders across customers when authorized as admin", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    listAllOrdersForAdminMock.mockResolvedValueOnce([
      {
        id: "ord-2",
        reference: "JA-222222",
        accountId: "cust-2",
        contactEmail: "bob@example.com",
        status: "paid",
        fulfillmentStatus: "unfulfilled",
        subtotalCents: 34900,
        shippingCents: 1500,
        taxCents: 2792,
        totalCents: 39192,
        currency: "USD",
        createdAt: new Date("2026-10-19T16:00:00Z"),
        paidAt: new Date("2026-10-19T16:00:00Z"),
        itemCount: 1,
        lineCount: 1,
      },
      {
        id: "ord-1",
        reference: "JA-111111",
        accountId: "cust-1",
        contactEmail: "alice@example.com",
        status: "paid",
        fulfillmentStatus: "unfulfilled",
        subtotalCents: 24900,
        shippingCents: 0,
        taxCents: 1992,
        totalCents: 26892,
        currency: "USD",
        createdAt: new Date("2026-10-19T15:00:00Z"),
        paidAt: new Date("2026-10-19T15:00:00Z"),
        itemCount: 2,
        lineCount: 1,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.orders).toHaveLength(2);
    expect(data.orders[0].reference).toBe("JA-222222");
    expect(data.orders[0].contactEmail).toBe("bob@example.com");
    expect(data.orders[1].reference).toBe("JA-111111");
    expect(data.orders[1].contactEmail).toBe("alice@example.com");
  });

  it("returns 500 when database fails unexpectedly", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });
    listAllOrdersForAdminMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Internal server error.");
  });
});
