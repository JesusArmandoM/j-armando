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

vi.mock("@/db/cart.ts", () => ({
  addVariantToCart: vi.fn(),
  updateCartLineQuantity: vi.fn(),
  removeCartLine: vi.fn(),
}));

import { addVariantToCart, removeCartLine, updateCartLineQuantity } from "@/db/cart.ts";
import { cookies } from "next/headers";

import { DELETE, PATCH, POST } from "./route";

const addVariantToCartMock = vi.mocked(addVariantToCart);
const updateCartLineQuantityMock = vi.mocked(updateCartLineQuantity);
const removeCartLineMock = vi.mocked(removeCartLine);
const cookiesMock = vi.mocked(cookies);

const VARIANT_ID = "123e4567-e89b-12d3-a456-426614174000";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/cart/lines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string, contentType: string): Request {
  return new Request("http://localhost/api/cart/lines", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieState.value = undefined;
  cookieState.set.mockReset();
  addVariantToCartMock.mockReset();
  cookiesMock.mockClear();
});

describe("POST /api/cart/lines", () => {
  it("returns 400 for a non-JSON content type before touching cookies or the database", async () => {
    const response = await POST(rawRequest(JSON.stringify({ variantId: VARIANT_ID, quantity: 1 }), "text/plain"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Request body must be JSON." });
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(addVariantToCartMock).not.toHaveBeenCalled();
    expect(cookieState.set).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before touching cookies or the database", async () => {
    const response = await POST(rawRequest("{not json", "application/json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(addVariantToCartMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input and never mints a cookie or writes", async () => {
    const bodies = [
      {},
      { variantId: "not-a-uuid", quantity: 1 },
      { variantId: VARIANT_ID, quantity: 0 },
      { variantId: VARIANT_ID, quantity: 11 },
      { variantId: VARIANT_ID, quantity: 1.5 },
      { variantId: VARIANT_ID, quantity: "2" },
    ];

    for (const body of bodies) {
      const response = await POST(jsonRequest(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toHaveProperty("error");
    }

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(addVariantToCartMock).not.toHaveBeenCalled();
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unavailable variant with an existing cookie and does not write or set a cookie", async () => {
    cookieState.value = "existing-session-token";
    addVariantToCartMock.mockResolvedValue({ ok: false, reason: "variant_unavailable" });

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 2 }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "This variant is no longer available.",
    });
    expect(addVariantToCartMock).toHaveBeenCalledWith(
      {},
      "existing-session-token",
      VARIANT_ID,
      2,
    );
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unavailable variant with no cookie without minting one", async () => {
    addVariantToCartMock.mockResolvedValue({ ok: false, reason: "variant_unavailable" });

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 1 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This variant is no longer available.",
    });
    // The route attempts the add with a generated in-memory token...
    expect(addVariantToCartMock).toHaveBeenCalledTimes(1);
    expect(addVariantToCartMock.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // ...but a rejected add must not hand the browser an identity cookie.
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("mints an opaque httpOnly cookie on the first add and returns only the line quantity", async () => {
    addVariantToCartMock.mockResolvedValue({
      ok: true,
      cartId: "internal-cart-id",
      lineId: "internal-line-id",
      lineQuantity: 3,
    });

    const response = await POST(
      new Request("http://localhost/api/cart/lines", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ variantId: VARIANT_ID, quantity: 2 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ lineQuantity: 3 });
    expect(JSON.stringify(body)).not.toContain("internal-cart-id");
    expect(JSON.stringify(body)).not.toContain("internal-line-id");

    expect(cookieState.set).toHaveBeenCalledTimes(1);
    const cookie = cookieState.set.mock.calls[0][0] as {
      name: string;
      value: string;
      httpOnly: boolean;
      sameSite: string;
      secure: boolean;
      path: string;
      maxAge: number;
    };
    expect(cookie.name).toBe("ja_cart_session");
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.secure).toBe(false);
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(60 * 60 * 24 * 30);

    expect(addVariantToCartMock).toHaveBeenCalledWith({}, cookie.value, VARIANT_ID, 2);
    // The cookie is persisted only after the repository confirms the add.
    expect(addVariantToCartMock.mock.invocationCallOrder[0]).toBeLessThan(
      cookieState.set.mock.invocationCallOrder[0],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
  });

  it("reuses an existing session cookie without minting a new one", async () => {
    cookieState.value = "existing-session-token";
    addVariantToCartMock.mockResolvedValue({
      ok: true,
      cartId: "internal-cart-id",
      lineId: "internal-line-id",
      lineQuantity: 4,
    });

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 2 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ lineQuantity: 4 });
    expect(addVariantToCartMock).toHaveBeenCalledWith(
      {},
      "existing-session-token",
      VARIANT_ID,
      2,
    );
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
  });

  it("returns 503 with a generic message when the database write fails", async () => {
    cookieState.value = "existing-session-token";
    addVariantToCartMock.mockRejectedValue(new Error("connection refused"));

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 1 }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "We could not add this item to your cart. Please try again.",
    });
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 503 without minting a cookie when a first add fails with no cookie", async () => {
    addVariantToCartMock.mockRejectedValue(new Error("connection refused"));

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 1 }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "We could not add this item to your cart. Please try again.",
    });
    expect(addVariantToCartMock).toHaveBeenCalledTimes(1);
    expect(addVariantToCartMock.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 400 with stock_exceeded code when addVariantToCart exceeds available stock", async () => {
    addVariantToCartMock.mockResolvedValue({
      ok: false,
      reason: "stock_exceeded",
      available: 3,
    });

    const response = await POST(jsonRequest({ variantId: VARIANT_ID, quantity: 4 }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Only 3 items available in stock.",
      code: "stock_exceeded",
      available: 3,
    });
    expect(cookieState.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

const TEST_LINE_ID = "987fcdeb-51a2-43d7-9876-543210fedcba";

function patchJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/cart/lines", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/cart/lines", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/cart/lines", () => {
  it("rejects non-JSON requests with 400", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/cart/lines", {
        method: "PATCH",
        headers: { "content-type": "text/plain" },
        body: "plain text",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid lineId or out-of-range quantity with 400", async () => {
    const invalidLine = await PATCH(patchJsonRequest({ lineId: "invalid", quantity: 2 }));
    expect(invalidLine.status).toBe(400);

    const invalidQty = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 15 }));
    expect(invalidQty.status).toBe(400);
  });

  it("returns 404 when no session cookie exists", async () => {
    cookieState.value = undefined;
    const response = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 3 }));
    expect(response.status).toBe(404);
  });

  it("returns 404 when updateCartLineQuantity returns not_found", async () => {
    cookieState.value = "session-token";
    updateCartLineQuantityMock.mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 3 }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Cart line not found." });
  });

  it("updates line quantity, returns 200 and revalidates /cart", async () => {
    cookieState.value = "session-token";
    updateCartLineQuantityMock.mockResolvedValue({ ok: true, lineId: TEST_LINE_ID, quantity: 4 });

    const response = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 4 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ lineId: TEST_LINE_ID, lineQuantity: 4 });
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
  });

  it("returns 503 on database failure", async () => {
    cookieState.value = "session-token";
    updateCartLineQuantityMock.mockRejectedValue(new Error("db down"));

    const response = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 4 }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 with stock_exceeded when updateCartLineQuantity exceeds stock", async () => {
    cookieState.value = "session-token";
    updateCartLineQuantityMock.mockResolvedValue({
      ok: false,
      reason: "stock_exceeded",
      available: 2,
    });

    const response = await PATCH(patchJsonRequest({ lineId: TEST_LINE_ID, quantity: 5 }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Only 2 items available in stock.",
      code: "stock_exceeded",
      available: 2,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/cart/lines", () => {
  it("rejects non-JSON requests with 400", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/cart/lines", {
        method: "DELETE",
        headers: { "content-type": "text/plain" },
        body: "plain text",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid lineId with 400", async () => {
    const response = await DELETE(deleteJsonRequest({ lineId: "bad-id" }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when no session cookie exists", async () => {
    cookieState.value = undefined;
    const response = await DELETE(deleteJsonRequest({ lineId: TEST_LINE_ID }));
    expect(response.status).toBe(404);
  });

  it("returns 404 when removeCartLine returns not_found", async () => {
    cookieState.value = "session-token";
    removeCartLineMock.mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await DELETE(deleteJsonRequest({ lineId: TEST_LINE_ID }));
    expect(response.status).toBe(404);
  });

  it("removes line, returns 200 and revalidates /cart", async () => {
    cookieState.value = "session-token";
    removeCartLineMock.mockResolvedValue({ ok: true, lineId: TEST_LINE_ID });

    const response = await DELETE(deleteJsonRequest({ lineId: TEST_LINE_ID }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ lineId: TEST_LINE_ID, removed: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
  });

  it("returns 503 on database failure", async () => {
    cookieState.value = "session-token";
    removeCartLineMock.mockRejectedValue(new Error("db down"));

    const response = await DELETE(deleteJsonRequest({ lineId: TEST_LINE_ID }));
    expect(response.status).toBe(503);
  });
});

