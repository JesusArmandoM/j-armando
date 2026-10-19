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

  it("returns 400 when payment provider fails", async () => {
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
    expect(body.error).toContain("Payment simulation failed");
    expect(body.failureReason).toBe("card_declined");
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
      },
    });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.reference).toBe("JA-654321");
    expect(body.redirectUrl).toBe("/checkout/confirmation/JA-654321");
    expect(body.order.totalCents).toBe(26892);

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
