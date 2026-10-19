// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-orders.ts", () => ({
  getOrderForAdmin: vi.fn(),
}));

import { getOrderForAdmin } from "@/db/admin-orders.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { GET } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);
const getOrderForAdminMock = vi.mocked(getOrderForAdmin);

describe("GET /api/admin/orders/[reference]", () => {
  const dummyContext = { params: Promise.resolve({ reference: "JA-123456" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    const res = await GET(
      new Request("http://localhost/api/admin/orders/JA-123456"),
      dummyContext,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Authentication required.");
    expect(getOrderForAdminMock).not.toHaveBeenCalled();
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

    const res = await GET(
      new Request("http://localhost/api/admin/orders/JA-123456"),
      dummyContext,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Access denied. Admin role required.");
    expect(getOrderForAdminMock).not.toHaveBeenCalled();
  });

  it("returns 404 when order reference does not exist", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });
    getOrderForAdminMock.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/admin/orders/JA-999999"),
      { params: Promise.resolve({ reference: "JA-999999" }) },
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Order not found.");
    expect(getOrderForAdminMock).toHaveBeenCalledWith(expect.anything(), "JA-999999");
  });

  it("returns 200 with full order details for any customer when authorized as admin", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    getOrderForAdminMock.mockResolvedValueOnce({
      id: "ord-1",
      reference: "JA-123456",
      accountId: "cust-1",
      contactEmail: "customer@example.com",
      status: "paid",
      fulfillmentStatus: "unfulfilled",
      subtotalCents: 24900,
      shippingCents: 1500,
      taxCents: 1992,
      totalCents: 28392,
      currency: "USD",
      createdAt: new Date("2026-10-19T14:00:00Z"),
      paidAt: new Date("2026-10-19T14:00:00Z"),
      shippingAddress: {
        recipientName: "Jane Doe",
        line1: "123 Fifth Ave",
        line2: null,
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: null,
      },
      shippingMethod: {
        id: "sm-exp",
        name: "Express Shipping",
        costCents: 1500,
        deliveryEstimate: "1-2 business days",
      },
      lines: [
        {
          id: "line-1",
          variantId: "v-1",
          productName: "Double-Breasted Linen Blazer",
          variantSize: "M",
          variantColor: "Navy",
          unitPriceCents: 24900,
          quantity: 1,
          lineTotalCents: 24900,
        },
      ],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/orders/JA-123456"),
      dummyContext,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.order.reference).toBe("JA-123456");
    expect(data.order.contactEmail).toBe("customer@example.com");
    expect(data.order.totalCents).toBe(28392);
    expect(data.order.lines).toHaveLength(1);
    expect(data.order.shippingAddress.city).toBe("New York");
  });
});
