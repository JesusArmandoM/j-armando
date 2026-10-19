import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    notFoundMock();
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/lib/auth/session-cookie.ts", () => ({
  getAccountSessionToken: vi.fn(),
}));

vi.mock("@/db/auth.ts", () => ({
  getAccountFromSessionToken: vi.fn(),
}));

vi.mock("@/db/order.ts", () => ({
  getOrderByReferenceForAccount: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getOrderByReferenceForAccount } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import OrderDetailPage, { generateMetadata } from "./page.tsx";

const getAccountSessionTokenMock = vi.mocked(getAccountSessionToken);
const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);
const getOrderByReferenceForAccountMock = vi.mocked(getOrderByReferenceForAccount);

describe("OrderDetailPage", () => {
  const dummyProps = { params: Promise.resolve({ reference: "JA-123456" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateMetadata includes order reference", async () => {
    const meta = await generateMetadata(dummyProps);
    expect(meta.title).toBe("Order JA-123456 — J. Armando");
  });

  it("redirects unauthenticated visitor to /account/signin with returnUrl", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce(undefined);

    await expect(OrderDetailPage(dummyProps)).rejects.toThrow("REDIRECT:/account/signin?returnUrl=/account/orders/JA-123456");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin?returnUrl=/account/orders/JA-123456");
  });

  it("redirects when session is invalid or expired", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("invalid_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    await expect(OrderDetailPage(dummyProps)).rejects.toThrow("REDIRECT:/account/signin?returnUrl=/account/orders/JA-123456");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin?returnUrl=/account/orders/JA-123456");
  });

  it("calls notFound() when order does not exist or is not owned by the customer", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("valid_token");
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
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      },
    });

    getOrderByReferenceForAccountMock.mockResolvedValueOnce(null);

    await expect(OrderDetailPage(dummyProps)).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(getOrderByReferenceForAccountMock).toHaveBeenCalledWith(expect.anything(), "JA-123456", "acc-user-1");
  });

  it("renders order details, lines, shipping, and financial totals when owned by customer", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("valid_token");
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
        expiresAt: new Date(Date.now() + 100000),
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
      shippingCents: 1500,
      taxCents: 1992,
      totalCents: 28392,
      currency: "USD",
      createdAt: new Date("2026-10-19T14:30:00Z"),
      paidAt: new Date("2026-10-19T14:30:00Z"),
      shippingAddress: {
        recipientName: "Jane Doe",
        line1: "123 Fifth Ave",
        line2: "Suite 400",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
        phone: "+1 555-0199",
      },
      shippingMethod: {
        id: "sm-exp",
        name: "Express Shipping",
        costCents: 1500,
        deliveryEstimate: "2-3 business days",
      },
      lines: [
        {
          id: "l-1",
          variantId: "v-1",
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

    const page = await OrderDetailPage(dummyProps);
    render(page);

    // Reference and header
    expect(screen.getByTestId("order-reference").textContent).toBe("JA-123456");
    expect(screen.getByTestId("order-status").textContent).toContain("Paid");
    expect(screen.getByTestId("order-fulfillment-status").textContent).toContain("Unfulfilled");
    expect(screen.getByTestId("order-contact-email").textContent).toContain("customer@example.com");

    // Line items
    expect(screen.getByTestId("order-line-name").textContent).toBe("Double-Breasted Linen Blazer");
    expect(screen.getByTestId("order-line-variant").textContent).toBe("Size 38 · Navy");
    expect(screen.getByTestId("order-line-qty").textContent).toBe("Qty: 1");
    expect(screen.getByTestId("order-line-unit-price").textContent).toBe("$249.00 each");
    expect(screen.getByTestId("order-line-total").textContent).toBe("$249.00");

    // Delivery details
    expect(screen.getByTestId("order-shipping-address").textContent).toContain("Jane Doe");
    expect(screen.getByTestId("order-shipping-address").textContent).toContain("123 Fifth Ave");
    expect(screen.getByTestId("order-shipping-address").textContent).toContain("Suite 400");
    expect(screen.getByTestId("order-shipping-method").textContent).toContain("Express Shipping");
    expect(screen.getByTestId("order-shipping-method").textContent).toContain("$15.00");

    // Financial totals
    expect(screen.getByTestId("order-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("order-shipping").textContent).toBe("$15.00");
    expect(screen.getByTestId("order-tax").textContent).toBe("$19.92");
    expect(screen.getByTestId("order-total").textContent).toBe("$283.92");

    // Navigation
    expect(screen.getByTestId("back-to-orders")).toBeTruthy();
    expect(screen.getByTestId("back-orders-btn")).toBeTruthy();
  });
});
