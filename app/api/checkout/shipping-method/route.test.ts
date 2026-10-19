// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
}));

const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "ja_cart_session" && cookieState.value !== undefined
        ? { name, value: cookieState.value }
        : undefined,
    set: cookieState.set,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/checkout.ts", () => ({
  listShippingMethods: vi.fn(),
  getCheckoutSession: vi.fn(),
  saveCheckoutShippingMethod: vi.fn(),
}));

import {
  getCheckoutSession,
  listShippingMethods,
  saveCheckoutShippingMethod,
} from "@/db/checkout.ts";

import { GET, POST } from "./route.ts";

const listShippingMethodsMock = vi.mocked(listShippingMethods);
const getCheckoutSessionMock = vi.mocked(getCheckoutSession);
const saveCheckoutShippingMethodMock = vi.mocked(saveCheckoutShippingMethod);

const VALID_METHOD_ID = "11111111-1111-4111-8111-111111111111";

const MOCK_SHIPPING_METHOD = {
  id: VALID_METHOD_ID,
  slug: "standard",
  name: "Standard Shipping",
  description: "Free standard shipping across the United States.",
  costCents: 0,
  deliveryEstimate: "3–5 business days",
};

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/checkout/shipping-method", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/shipping-method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = "mock_session_token_123";
  });

  it("rejects non-JSON content-type with 400", async () => {
    const request = new Request("http://localhost/api/checkout/shipping-method", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: `shippingMethodId=${VALID_METHOD_ID}`,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Request body must be JSON.");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed JSON body with 400", async () => {
    const request = new Request("http://localhost/api/checkout/shipping-method", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json}",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Request body must be valid JSON.");
  });

  it("rejects missing shippingMethodId with 400", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Please select a valid shipping method.");
  });

  it("rejects non-UUID shippingMethodId with 400", async () => {
    const response = await POST(jsonRequest({ shippingMethodId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Please select a valid shipping method.");
  });

  it("rejects request when no cart session cookie exists", async () => {
    cookieState.value = undefined;

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe(
      "No active cart session found. Please add items to your cart first.",
    );
  });

  it("returns 400 when cart is not found in database", async () => {
    saveCheckoutShippingMethodMock.mockResolvedValueOnce({
      ok: false,
      reason: "cart_not_found",
    });

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("No active cart found for this session.");
  });

  it("returns 400 when Step 1 (address) is not yet completed", async () => {
    saveCheckoutShippingMethodMock.mockResolvedValueOnce({
      ok: false,
      reason: "address_required",
    });

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Please complete contact and shipping address first.");
  });

  it("returns 400 when shipping method does not exist", async () => {
    saveCheckoutShippingMethodMock.mockResolvedValueOnce({
      ok: false,
      reason: "shipping_method_not_found",
    });

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("The selected shipping method is not available.");
  });

  it("persists shipping method, revalidates /checkout, and returns 200 with session details", async () => {
    saveCheckoutShippingMethodMock.mockResolvedValueOnce({
      ok: true,
      checkoutSession: {
        id: "session-uuid",
        cartId: "cart-uuid",
        email: "alexandra.vance@studio.com",
        recipientName: "Alexandra Vance",
        line1: "123 Main St",
        line2: null,
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: null,
        passwordHash: null,
        shippingMethodId: VALID_METHOD_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      shippingMethod: MOCK_SHIPPING_METHOD,
    });

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(revalidatePathMock).toHaveBeenCalledWith("/checkout");

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.checkoutSession.shippingMethodId).toBe(VALID_METHOD_ID);
    expect(data.checkoutSession.shippingMethod.name).toBe("Standard Shipping");
    expect(data.checkoutSession.shippingMethod.costCents).toBe(0);
  });

  it("returns 503 when database throws unexpectedly", async () => {
    saveCheckoutShippingMethodMock.mockRejectedValueOnce(new Error("DB pool crashed"));

    const response = await POST(jsonRequest({ shippingMethodId: VALID_METHOD_ID }));
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("Could not save shipping method. Please try again.");
  });
});

describe("GET /api/checkout/shipping-method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = "mock_session_token_123";
  });

  it("returns shipping methods list and selected shipping method id", async () => {
    listShippingMethodsMock.mockResolvedValueOnce([MOCK_SHIPPING_METHOD]);
    getCheckoutSessionMock.mockResolvedValueOnce({
      id: "session-uuid",
      cartId: "cart-uuid",
      email: "test@example.com",
      recipientName: "Test",
      line1: "123 St",
      line2: null,
      city: "NYC",
      state: "NY",
      zip: "10001",
      country: "US",
      phone: null,
      passwordHash: null,
      shippingMethodId: VALID_METHOD_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      shippingMethod: MOCK_SHIPPING_METHOD,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const data = await response.json();
    expect(data.shippingMethods).toHaveLength(1);
    expect(data.shippingMethods[0].slug).toBe("standard");
    expect(data.selectedShippingMethodId).toBe(VALID_METHOD_ID);
  });

  it("returns null selectedShippingMethodId if no session exists", async () => {
    cookieState.value = undefined;
    listShippingMethodsMock.mockResolvedValueOnce([MOCK_SHIPPING_METHOD]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.shippingMethods).toHaveLength(1);
    expect(data.selectedShippingMethodId).toBeNull();
  });
});
