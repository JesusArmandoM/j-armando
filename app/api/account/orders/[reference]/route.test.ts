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
  getOrderByReferenceForAccount: vi.fn(),
}));

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getOrderByReferenceForAccount } from "@/db/order.ts";
import { GET } from "./route.ts";

const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);
const getOrderByReferenceForAccountMock = vi.mocked(getOrderByReferenceForAccount);

describe("GET /api/account/orders/[reference]", () => {
  const dummyContext = { params: Promise.resolve({ reference: "JA-123456" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = undefined;
  });

  it("returns 401 Unauthorized when no session cookie exists", async () => {
    const res = await GET(new Request("http://localhost/api/account/orders/JA-123456"), dummyContext);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 Unauthorized when session token is invalid or expired", async () => {
    cookieState.value = "invalid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/account/orders/JA-123456"), dummyContext);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 Not Found when order reference is not found or not owned by account", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-user-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-user-1",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    getOrderByReferenceForAccountMock.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/account/orders/JA-123456"), dummyContext);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Order not found");
    expect(getOrderByReferenceForAccountMock).toHaveBeenCalledWith(expect.anything(), "JA-123456", "acc-user-1");
  });

  it("returns 200 with order details when owned by account", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-user-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-user-1",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    const mockOrder = {
      id: "ord-1",
      reference: "JA-123456",
      accountId: "acc-user-1",
      contactEmail: "customer@example.com",
      status: "paid" as const,
      fulfillmentStatus: "unfulfilled" as const,
      subtotalCents: 24900,
      shippingCents: 0,
      taxCents: 1992,
      totalCents: 26892,
      currency: "USD",
      createdAt: new Date("2026-10-19T12:00:00Z"),
      paidAt: new Date("2026-10-19T12:00:00Z"),
      shippingAddress: {
        recipientName: "Customer One",
        line1: "123 Broadway",
        line2: null,
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: null,
      },
      shippingMethod: {
        id: "ship-std",
        name: "Standard Shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
      lines: [
        {
          id: "line-1",
          variantId: "var-1",
          productName: "Double-Breasted Linen Blazer",
          variantSize: "38",
          variantColor: "Navy",
          unitPriceCents: 24900,
          quantity: 1,
          lineTotalCents: 24900,
        },
      ],
    };

    getOrderByReferenceForAccountMock.mockResolvedValueOnce(mockOrder);

    const res = await GET(new Request("http://localhost/api/account/orders/JA-123456"), dummyContext);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.order.reference).toBe("JA-123456");
    expect(data.order.totalCents).toBe(26892);
    expect(data.order.lines).toHaveLength(1);
    expect(data.order.shippingAddress.city).toBe("New York");
  });

  it("returns 500 when database fails", async () => {
    cookieState.value = "valid_token";
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-user-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-user-1",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
      },
    });

    getOrderByReferenceForAccountMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await GET(new Request("http://localhost/api/account/orders/JA-123456"), dummyContext);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Internal server error");
  });
});
