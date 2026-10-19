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

vi.mock("@/db/order.ts", () => ({
  createPaidOrderFromCheckout: vi.fn(),
}));

import { createPaidOrderFromCheckout } from "@/db/order.ts";

import { POST } from "./route.ts";

const createPaidOrderFromCheckoutMock = vi.mocked(createPaidOrderFromCheckout);

describe("POST /api/checkout/pay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cookieState.value = undefined;
    revalidatePathMock.mockClear();
  });

  it("returns 400 with no-store when no ja_cart_session cookie is present", async () => {
    cookieState.value = undefined;

    const response = await POST();
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.error).toContain("No active cart session found");
  });

  it("returns 400 when cart is empty or not found", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "cart_empty",
    });

    const response = await POST();
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.error).toContain("Your cart is empty");
  });

  it("returns 400 when address (Step 1) is incomplete", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "address_required",
    });

    const response = await POST();
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.error).toContain("contact email and shipping address first");
  });

  it("returns 400 when shipping method (Step 2) is missing", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "shipping_method_required",
    });

    const response = await POST();
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.error).toContain("select a shipping method");
  });

  it("returns 400 with retryable error payload when payment provider fails", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.failed",
      failureReason: "card_declined",
    });

    const response = await POST();
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      "Payment failed: The payment was declined. Please try another payment method.",
    );
    expect(body.code).toBe("payment_failed");
    expect(body.retryable).toBe(true);
    expect(body.failureReason).toBe("card_declined");
  });

  it("drives payment scenario 'fail' with failureReason from request body", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.failed",
      failureReason: "insufficient_funds",
    });

    const request = new Request("http://localhost/api/checkout/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "fail", failureReason: "insufficient_funds" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    expect(createPaidOrderFromCheckoutMock).toHaveBeenCalledWith(
      expect.anything(),
      "test-session",
      { scenario: "fail", failureReason: "insufficient_funds" },
    );

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      "Payment failed: Insufficient funds. Please try another payment method.",
    );
    expect(body.code).toBe("payment_failed");
    expect(body.retryable).toBe(true);
    expect(body.failureReason).toBe("insufficient_funds");
  });

  it("drives payment scenario 'pending' via request header and returns non-retryable pending response", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.pending",
    });

    const request = new Request("http://localhost/api/checkout/pay", {
      method: "POST",
      headers: { "x-payment-scenario": "pending" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    expect(createPaidOrderFromCheckoutMock).toHaveBeenCalledWith(
      expect.anything(),
      "test-session",
      { scenario: "pending", failureReason: "card_declined" },
    );

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      "Payment is pending authorization. Please wait or check your account.",
    );
    expect(body.code).toBe("payment_pending");
    expect(body.retryable).toBe(false);
  });

  it("supports retrying after failure and returns 200 with redirectUrl on success", async () => {
    cookieState.value = "test-session";
    // First attempt: failure
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "payment_failed",
      paymentOutcome: "payment.failed",
      failureReason: "card_declined",
    });

    const failReq = new Request("http://localhost/api/checkout/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "fail" }),
    });

    const failResponse = await POST(failReq);
    expect(failResponse.status).toBe(400);
    const failBody = await failResponse.json();
    expect(failBody.retryable).toBe(true);

    // Second attempt: retry with success
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: true,
      order: {
        id: "order-retry-1",
        reference: "JA-112233",
        totalCents: 24900,
        contactEmail: "shopper@example.com",
        accountId: "account-123",
      },
      accountId: "account-123",
      isNewAccount: true,
    });

    const retryReq = new Request("http://localhost/api/checkout/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "succeed" }),
    });

    const retryResponse = await POST(retryReq);
    expect(retryResponse.status).toBe(200);

    const retryBody = await retryResponse.json();
    expect(retryBody.ok).toBe(true);
    expect(retryBody.reference).toBe("JA-112233");
    expect(retryBody.redirectUrl).toBe("/checkout/confirmation/JA-112233");
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
    expect(revalidatePathMock).toHaveBeenCalledWith("/checkout");
  });

  it("returns 200 with redirectUrl and revalidates paths on payment success", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: true,
      order: {
        id: "order-uuid-1",
        reference: "JA-654321",
        totalCents: 26892,
        contactEmail: "shopper@example.com",
        accountId: "acc-uuid-1",
      },
      accountId: "acc-uuid-1",
      isNewAccount: true,
    });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.reference).toBe("JA-654321");
    expect(body.redirectUrl).toBe("/checkout/confirmation/JA-654321");
    expect(body.order.totalCents).toBe(26892);
    expect(body.accountId).toBe("acc-uuid-1");
    expect(body.isNewAccount).toBe(true);

    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
    expect(revalidatePathMock).toHaveBeenCalledWith("/checkout");
  });

  it("returns 409 when cart items are out of stock", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "out_of_stock",
      variantId: "variant-123",
      productName: "Double-Breasted Linen Blazer",
    });

    const response = await POST();
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.code).toBe("out_of_stock");
    expect(body.error).toContain(
      "One or more items in your cart are no longer available in the requested quantity",
    );
    expect(body.variantId).toBe("variant-123");
    expect(body.productName).toBe("Double-Breasted Linen Blazer");
  });

  it("returns 503 when unexpected database failure occurs", async () => {
    cookieState.value = "test-session";
    createPaidOrderFromCheckoutMock.mockRejectedValueOnce(new Error("db down"));

    const response = await POST();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.error).toContain("Unable to process payment right now");
  });
});
