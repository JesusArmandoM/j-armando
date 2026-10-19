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

vi.mock("@/db/order.ts", () => ({
  listOrdersForAccount: vi.fn(),
}));

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { listOrdersForAccount } from "@/db/order.ts";
import { GET } from "./route.ts";

const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);
const listOrdersForAccountMock = vi.mocked(listOrdersForAccount);

describe("GET /api/account/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("returns 401 Unauthorized when no session cookie exists", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 Unauthorized when session is invalid or expired", async () => {
    cookieState.value = "invalid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 200 with list of orders for authenticated account", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-123",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-123",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    const mockOrders = [
      {
        id: "ord-1",
        reference: "JA-123456",
        accountId: "acc-123",
        contactEmail: "customer@example.com",
        status: "paid" as const,
        fulfillmentStatus: "unfulfilled" as const,
        subtotalCents: 10000,
        shippingCents: 1500,
        taxCents: 800,
        totalCents: 12300,
        currency: "USD",
        createdAt: new Date("2026-10-19T10:00:00Z"),
        paidAt: new Date("2026-10-19T10:00:00Z"),
        lineCount: 1,
        itemCount: 2,
        lines: [],
        shippingAddress: {
          recipientName: "Customer",
          line1: "123 Main St",
          line2: null,
          city: "New York",
          state: "NY",
          zip: "10001",
          country: "US",
          phone: null,
        },
        shippingMethod: {
          id: "ship-1",
          name: "Express Shipping",
          costCents: 1500,
          deliveryEstimate: "2-3 business days",
        },
      },
    ];

    listOrdersForAccountMock.mockResolvedValueOnce(mockOrders);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].reference).toBe("JA-123456");
    expect(data.orders[0].totalCents).toBe(12300);
    expect(listOrdersForAccountMock).toHaveBeenCalledWith(expect.anything(), "acc-123");
  });

  it("returns 500 when listOrdersForAccount throws error", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-123",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-123",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    listOrdersForAccountMock.mockRejectedValueOnce(new Error("Database failure"));

    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Internal server error");
  });
});
