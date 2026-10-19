import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth/session-cookie.ts", () => ({
  getAccountSessionToken: vi.fn(),
}));

vi.mock("@/db/auth.ts", () => ({
  getAccountFromSessionToken: vi.fn(),
}));

vi.mock("@/db/order.ts", () => ({
  listOrdersForAccount: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { listOrdersForAccount } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import OrderHistoryPage from "./page.tsx";

const getAccountSessionTokenMock = vi.mocked(getAccountSessionToken);
const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);
const listOrdersForAccountMock = vi.mocked(listOrdersForAccount);

describe("OrderHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated visitor to /account/signin?returnUrl=/account/orders", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce(undefined);

    await expect(OrderHistoryPage()).rejects.toThrow("REDIRECT:/account/signin?returnUrl=/account/orders");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin?returnUrl=/account/orders");
  });

  it("redirects when session is invalid or expired", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("invalid_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    await expect(OrderHistoryPage()).rejects.toThrow("REDIRECT:/account/signin?returnUrl=/account/orders");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin?returnUrl=/account/orders");
  });

  it("renders empty state when customer has no orders", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("valid_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-1",
        email: "shopper@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-1",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      },
    });
    listOrdersForAccountMock.mockResolvedValueOnce([]);

    const page = await OrderHistoryPage();
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Order History" })).toBeTruthy();
    expect(screen.getByTestId("orders-empty")).toBeTruthy();
    expect(screen.getByText("You haven't placed any orders yet.")).toBeTruthy();
    expect(screen.getByTestId("browse-catalog-link")).toBeTruthy();
  });

  it("renders list of orders when customer has order history", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("valid_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-1",
        email: "shopper@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-1",
        sessionToken: "valid_token",
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      },
    });

    listOrdersForAccountMock.mockResolvedValueOnce([
      {
        id: "ord-1",
        reference: "JA-654321",
        accountId: "acc-1",
        contactEmail: "shopper@example.com",
        status: "paid" as const,
        fulfillmentStatus: "unfulfilled" as const,
        subtotalCents: 24900,
        shippingCents: 1500,
        taxCents: 1992,
        totalCents: 28392,
        currency: "USD",
        createdAt: new Date("2026-10-19T14:30:00Z"),
        paidAt: new Date("2026-10-19T14:30:00Z"),
        lineCount: 1,
        itemCount: 2,
        lines: [
          {
            id: "l-1",
            variantId: "v-1",
            productName: "Double-Breasted Linen Blazer",
            variantSize: "38",
            variantColor: "Navy",
            unitPriceCents: 24900,
            quantity: 2,
            lineTotalCents: 49800,
          },
        ],
        shippingAddress: {
          recipientName: "Shopper One",
          line1: "123 Elm St",
          line2: null,
          city: "New York",
          state: "NY",
          zip: "10001",
          country: "US",
          phone: null,
        },
        shippingMethod: {
          id: "sm-1",
          name: "Express Shipping",
          costCents: 1500,
          deliveryEstimate: "2-3 business days",
        },
      },
    ]);

    const page = await OrderHistoryPage();
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Order History" })).toBeTruthy();
    expect(screen.getByTestId("orders-list")).toBeTruthy();
    expect(screen.getByTestId("order-list-item")).toBeTruthy();
    expect(screen.getByTestId("order-reference").textContent).toBe("JA-654321");
    expect(screen.getByTestId("order-status").textContent).toContain("Paid");
    expect(screen.getByTestId("order-fulfillment").textContent).toContain("Unfulfilled");
    expect(screen.getByTestId("order-items-count").textContent).toBe("2 items");
    expect(screen.getByTestId("order-total").textContent).toBe("$283.92");
    expect(screen.getByTestId("order-details-link")).toBeTruthy();
  });
});
