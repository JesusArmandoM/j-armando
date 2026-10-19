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
  getCheckoutSession: vi.fn(),
  saveCheckoutContactAndAddress: vi.fn(),
}));

import { getCheckoutSession, saveCheckoutContactAndAddress } from "@/db/checkout.ts";

import { GET, POST } from "./route.ts";

const getCheckoutSessionMock = vi.mocked(getCheckoutSession);
const saveCheckoutContactAndAddressMock = vi.mocked(saveCheckoutContactAndAddress);

const VALID_INPUT = {
  email: "alexandra.vance@studio.com",
  recipientName: "Alexandra Vance",
  line1: "123 Main Street",
  line2: "Apt 4B",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "US",
  phone: "+1 555-019-2834",
};

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/checkout/contact-and-address", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/contact-and-address", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieState.value = "mock_session_token_123";
  });

  it("rejects non-JSON content-type with 400", async () => {
    const request = new Request("http://localhost/api/checkout/contact-and-address", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "email=test@example.com",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Request body must be JSON.");
  });

  it("rejects malformed JSON body with 400", async () => {
    const request = new Request("http://localhost/api/checkout/contact-and-address", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json}",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Request body must be valid JSON.");
  });

  it("rejects missing required fields with 400 and structured error map", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Please correct the errors in the form.");
    expect(data.errors).toBeDefined();
    expect(data.errors.email).toBe("Email is required");
    expect(data.errors.recipientName).toBe("Recipient full name is required");
    expect(data.errors.line1).toBe("Street address is required");
  });

  it("rejects request without active cart cookie with 400", async () => {
    cookieState.value = undefined;

    const response = await POST(jsonRequest(VALID_INPUT));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("No active cart session found");
    expect(saveCheckoutContactAndAddressMock).not.toHaveBeenCalled();
  });

  it("returns 400 when repository reports cart_not_found", async () => {
    saveCheckoutContactAndAddressMock.mockResolvedValueOnce({
      ok: false,
      reason: "cart_not_found",
    });

    const response = await POST(jsonRequest(VALID_INPUT));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("No active cart found for this session.");
  });

  it("persists contact and address, revalidates /checkout, and returns 200 with checkoutSession", async () => {
    saveCheckoutContactAndAddressMock.mockResolvedValueOnce({
      ok: true,
      checkoutSession: {
        id: "session-uuid-123",
        cartId: "cart-uuid-456",
        email: "alexandra.vance@studio.com",
        recipientName: "Alexandra Vance",
        line1: "123 Main Street",
        line2: "Apt 4B",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: "+1 555-019-2834",
        passwordHash: null,
        shippingMethodId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const response = await POST(jsonRequest(VALID_INPUT));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.checkoutSession.email).toBe("alexandra.vance@studio.com");
    expect(data.checkoutSession.recipientName).toBe("Alexandra Vance");
    expect(revalidatePathMock).toHaveBeenCalledWith("/checkout");
  });

  it("hashes password and passes passwordHash to saveCheckoutContactAndAddress", async () => {
    saveCheckoutContactAndAddressMock.mockResolvedValueOnce({
      ok: true,
      checkoutSession: {
        id: "session-uuid-1",
        cartId: "cart-uuid-1",
        email: "alexandra.vance@studio.com",
        recipientName: "Alexandra Vance",
        line1: "123 Main Street",
        line2: "Apt 4B",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: "+1 555-019-2834",
        passwordHash: "salt:mockhash",
        shippingMethodId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const response = await POST(
      jsonRequest({
        ...VALID_INPUT,
        password: "SuperSecretPassword123",
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.checkoutSession.hasPassword).toBe(true);
    expect((data.checkoutSession as Record<string, unknown>).passwordHash).toBeUndefined();

    expect(saveCheckoutContactAndAddressMock).toHaveBeenCalledWith(
      expect.anything(),
      "mock_session_token_123",
      expect.objectContaining({
        email: "alexandra.vance@studio.com",
        passwordHash: expect.stringMatching(/^[0-9a-f]{32}:[0-9a-f]{128}$/),
      }),
    );
  });

  it("rejects password shorter than 8 characters with 400", async () => {
    const response = await POST(
      jsonRequest({
        ...VALID_INPUT,
        password: "short",
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.errors.password).toBe("Password must be at least 8 characters long");
    expect(saveCheckoutContactAndAddressMock).not.toHaveBeenCalled();
  });

  it("returns 503 when unexpected database error occurs", async () => {
    saveCheckoutContactAndAddressMock.mockRejectedValueOnce(new Error("DB crashed"));

    const response = await POST(jsonRequest(VALID_INPUT));
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toContain("Could not save contact and shipping address");
  });
});

describe("GET /api/checkout/contact-and-address", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null checkoutSession when no cookie is present", async () => {
    cookieState.value = undefined;

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.checkoutSession).toBeNull();
  });

  it("returns existing checkout session for session cookie", async () => {
    cookieState.value = "valid_token";
    getCheckoutSessionMock.mockResolvedValueOnce({
      id: "session-uuid",
      cartId: "cart-uuid",
      email: "saved@example.com",
      recipientName: "Saved Name",
      line1: "Saved St",
      line2: null,
      city: "Saved City",
      state: "CA",
      zip: "90210",
      country: "US",
      phone: null,
      passwordHash: null,
      shippingMethodId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.checkoutSession.email).toBe("saved@example.com");
    expect(data.checkoutSession.hasPassword).toBe(false);
    expect(data.checkoutSession.passwordHash).toBeUndefined();
  });
});
