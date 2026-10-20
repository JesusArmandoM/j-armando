// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-orders.ts", () => ({
  updateOrderFulfillmentStatus: vi.fn(),
}));

import { updateOrderFulfillmentStatus } from "@/db/admin-orders.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { PATCH, POST } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);
const updateOrderFulfillmentStatusMock = vi.mocked(updateOrderFulfillmentStatus);

describe("PATCH & POST /api/admin/orders/[reference]/fulfillment", () => {
  const dummyContext = { params: Promise.resolve({ reference: "JA-123456" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "preparing" }),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Authentication required.");
    expect(updateOrderFulfillmentStatusMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks admin role", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: {
        id: "cust-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "preparing" }),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Access denied. Admin role required.");
    expect(updateOrderFulfillmentStatusMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing or fulfillmentStatus is invalid", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Missing or invalid 'fulfillmentStatus'");
  });

  it("returns 404 when order reference is not found", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    updateOrderFulfillmentStatusMock.mockResolvedValueOnce({
      ok: false,
      error: "not_found",
      message: "Order not found.",
    });

    const req = new Request("http://localhost/api/admin/orders/JA-999999/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "preparing" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ reference: "JA-999999" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Order not found.");
  });

  it("returns 400 when order is not paid", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    updateOrderFulfillmentStatusMock.mockResolvedValueOnce({
      ok: false,
      error: "order_not_paid",
      message: "Cannot update fulfillment for order with payment status 'pending'. Only paid orders can be fulfilled.",
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "preparing" }),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Only paid orders can be fulfilled");
  });

  it("returns 400 when transition is invalid", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    updateOrderFulfillmentStatusMock.mockResolvedValueOnce({
      ok: false,
      error: "invalid_transition",
      message: "Cannot transition fulfillment from 'unfulfilled' to 'delivered'.",
      currentStatus: "unfulfilled",
      requestedStatus: "delivered",
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "delivered" }),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Cannot transition fulfillment");
    expect(data.currentStatus).toBe("unfulfilled");
    expect(data.requestedStatus).toBe("delivered");
  });

  it("returns 200 with updated order on valid PATCH request", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    const mockOrder = {
      id: "ord-1",
      reference: "JA-123456",
      accountId: "cust-1",
      contactEmail: "buyer@example.com",
      status: "paid" as const,
      fulfillmentStatus: "preparing" as const,
      subtotalCents: 24900,
      shippingCents: 0,
      taxCents: 2000,
      totalCents: 26900,
      currency: "USD",
      createdAt: new Date(),
      paidAt: new Date(),
      shippingAddress: {
        recipientName: "Buyer",
        line1: "123 Main St",
        line2: null,
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: null,
      },
      shippingMethod: {
        id: "sm-std",
        name: "Standard",
        costCents: 0,
        deliveryEstimate: "3-5 days",
      },
      lines: [],
    };

    updateOrderFulfillmentStatusMock.mockResolvedValueOnce({
      ok: true,
      order: mockOrder,
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "preparing" }),
    });

    const res = await PATCH(req, dummyContext);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.order.fulfillmentStatus).toBe("preparing");
  });

  it("works with POST as well as PATCH", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: { id: "adm-1", email: "admin@example.com", createdAt: new Date() },
      roles: ["admin"],
    });

    const mockOrder = {
      id: "ord-1",
      reference: "JA-123456",
      accountId: "cust-1",
      contactEmail: "buyer@example.com",
      status: "paid" as const,
      fulfillmentStatus: "shipped" as const,
      subtotalCents: 24900,
      shippingCents: 0,
      taxCents: 2000,
      totalCents: 26900,
      currency: "USD",
      createdAt: new Date(),
      paidAt: new Date(),
      shippingAddress: {
        recipientName: "Buyer",
        line1: "123 Main St",
        line2: null,
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: null,
      },
      shippingMethod: {
        id: "sm-std",
        name: "Standard",
        costCents: 0,
        deliveryEstimate: "3-5 days",
      },
      lines: [],
    };

    updateOrderFulfillmentStatusMock.mockResolvedValueOnce({
      ok: true,
      order: mockOrder,
    });

    const req = new Request("http://localhost/api/admin/orders/JA-123456/fulfillment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentStatus: "shipped" }),
    });

    const res = await POST(req, dummyContext);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.order.fulfillmentStatus).toBe("shipped");
  });
});
