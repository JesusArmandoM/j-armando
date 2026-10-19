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

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-orders.ts", () => ({
  getOrderForAdmin: vi.fn(),
}));

import { getOrderForAdmin } from "@/db/admin-orders.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import AdminOrderDetailPage, { generateMetadata } from "./page.tsx";

const getAdminSessionMock = vi.mocked(getAdminSession);
const getOrderForAdminMock = vi.mocked(getOrderForAdmin);

describe("AdminOrderDetailPage", () => {
  const dummyProps = { params: Promise.resolve({ reference: "JA-123456" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateMetadata includes order reference", async () => {
    const meta = await generateMetadata(dummyProps);
    expect(meta.title).toBe("Order JA-123456 — J. Armando Backoffice");
  });

  it("redirects unauthenticated visitor to /account/signin with returnUrl", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    await expect(AdminOrderDetailPage(dummyProps)).rejects.toThrow(
      "REDIRECT:/account/signin?returnUrl=/admin/orders/JA-123456",
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/account/signin?returnUrl=/admin/orders/JA-123456",
    );
  });

  it("calls notFound() when order reference does not exist", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });
    getOrderForAdminMock.mockResolvedValueOnce(null);

    await expect(AdminOrderDetailPage(dummyProps)).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders read-only order details, frozen lines, delivery details, and financial summary", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    getOrderForAdminMock.mockResolvedValueOnce({
      id: "ord-1",
      reference: "JA-123456",
      accountId: "cust-1",
      contactEmail: "alice.customer@example.com",
      status: "paid",
      fulfillmentStatus: "unfulfilled",
      subtotalCents: 24900,
      shippingCents: 1500,
      taxCents: 1992,
      totalCents: 28392,
      currency: "USD",
      createdAt: new Date("2026-10-19T14:30:00Z"),
      paidAt: new Date("2026-10-19T14:30:00Z"),
      shippingAddress: {
        recipientName: "Alice Customer",
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
        deliveryEstimate: "1-2 business days",
      },
      lines: [
        {
          id: "l-1",
          variantId: "v-1",
          productName: "Double-Breasted Linen Blazer",
          variantSize: "M",
          variantColor: "Navy",
          unitPriceCents: 24900,
          quantity: 1,
          lineTotalCents: 24900,
        },
      ],
    });

    const page = await AdminOrderDetailPage(dummyProps);
    render(page);

    expect(screen.getByTestId("admin-order-detail-reference").textContent).toBe(
      "JA-123456",
    );
    expect(screen.getByTestId("admin-order-detail-email").textContent).toContain(
      "alice.customer@example.com",
    );
    expect(screen.getByTestId("admin-order-detail-status").textContent).toContain(
      "Paid",
    );
    expect(
      screen.getByTestId("admin-order-detail-fulfillment").textContent,
    ).toContain("Unfulfilled");

    expect(screen.getByTestId("admin-order-line-name").textContent).toBe(
      "Double-Breasted Linen Blazer",
    );
    expect(screen.getByTestId("admin-order-line-variant").textContent).toContain(
      "Size M · Navy",
    );
    expect(screen.getByTestId("admin-order-line-qty").textContent).toBe("Qty: 1");
    expect(screen.getByTestId("admin-order-line-unit-price").textContent).toBe(
      "$249.00 each",
    );
    expect(screen.getByTestId("admin-order-line-total").textContent).toBe(
      "$249.00",
    );

    expect(
      screen.getByTestId("admin-order-shipping-address").textContent,
    ).toContain("Alice Customer");
    expect(
      screen.getByTestId("admin-order-shipping-address").textContent,
    ).toContain("123 Fifth Ave");
    expect(
      screen.getByTestId("admin-order-shipping-address").textContent,
    ).toContain("Suite 400");
    expect(
      screen.getByTestId("admin-order-shipping-method").textContent,
    ).toContain("Express Shipping");
    expect(
      screen.getByTestId("admin-order-shipping-method").textContent,
    ).toContain("$15.00");

    expect(screen.getByTestId("admin-order-subtotal").textContent).toBe(
      "$249.00",
    );
    expect(screen.getByTestId("admin-order-shipping").textContent).toBe("$15.00");
    expect(screen.getByTestId("admin-order-tax").textContent).toBe("$19.92");
    expect(screen.getByTestId("admin-order-total").textContent).toBe("$283.92");
    expect(
      screen.getByTestId("back-to-admin-orders").getAttribute("href"),
    ).toBe("/admin/orders");
  });
});
