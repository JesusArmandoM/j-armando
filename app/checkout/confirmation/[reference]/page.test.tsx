import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/order.ts", () => ({
  getOrderByReference: vi.fn(),
}));

import { getOrderByReference } from "@/db/order.ts";
import type { OrderWithDetails } from "@/db/order.ts";

import OrderConfirmationPage, { generateMetadata } from "./page";

const getOrderByReferenceMock = vi.mocked(getOrderByReference);

const mockOrder: OrderWithDetails = {
  id: "order-1",
  reference: "JA-847291",
  accountId: "account-1",
  isNewAccount: true,
  contactEmail: "elena.rostova@example.com",
  status: "paid",
  fulfillmentStatus: "unfulfilled",
  subtotalCents: 24900,
  shippingCents: 1500,
  taxCents: 1992,
  totalCents: 28392,
  currency: "USD",
  createdAt: new Date("2026-10-19T14:30:00Z"),
  paidAt: new Date("2026-10-19T14:30:05Z"),
  shippingAddress: {
    recipientName: "Elena Rostova",
    line1: "742 Evergreen Terrace",
    line2: "Suite 100",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
    phone: "+1 555-019-2834",
  },
  shippingMethod: {
    id: "method-1",
    name: "Express Shipping",
    costCents: 1500,
    deliveryEstimate: "1–2 business days",
  },
  lines: [
    {
      id: "line-1",
      variantId: "variant-1",
      productName: "Double-Breasted Linen Blazer",
      variantSize: "M",
      variantColor: "Ivory",
      unitPriceCents: 24900,
      quantity: 1,
      lineTotalCents: 24900,
    },
  ],
};

describe("OrderConfirmationPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    notFoundMock.mockClear();
  });

  it("generates correct metadata title", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    expect(meta.title).toBe("Order JA-847291 Confirmed — J. Armando");
  });

  it("calls notFound when order is not found", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(undefined);

    await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-000000" }),
    });

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("renders order reference, status (Paid), and fulfillment (Unfulfilled)", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    expect(screen.getByTestId("order-reference").textContent).toBe("JA-847291");
    expect(screen.getByTestId("order-status").textContent).toContain("Status: Paid");
    expect(screen.getByTestId("order-fulfillment-status").textContent).toContain(
      "Fulfillment: Unfulfilled",
    );
    expect(screen.getByTestId("confirmation-notice").textContent).toContain(
      "elena.rostova@example.com",
    );
    expect(screen.getByTestId("account-notice").textContent).toBe(
      "We've created an account for your order at elena.rostova@example.com.",
    );
  });

  it("renders linked account notice when order is linked to existing account", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce({
      ...mockOrder,
      isNewAccount: false,
    });

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    expect(screen.getByTestId("account-notice").textContent).toBe(
      "Order linked to your account elena.rostova@example.com.",
    );
  });

  it("renders linked account notice when searchParams indicates account=linked", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
      searchParams: Promise.resolve({ account: "linked" }),
    });
    render(ui);

    expect(screen.getByTestId("account-notice").textContent).toBe(
      "Order linked to your account elena.rostova@example.com.",
    );
  });

  it("renders frozen line items with name, variant, qty, unit price and line total", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    expect(screen.getByTestId("order-line-name").textContent).toBe(
      "Double-Breasted Linen Blazer",
    );
    expect(screen.getByTestId("order-line-variant").textContent).toBe("Size M · Ivory");
    expect(screen.getByTestId("order-line-qty").textContent).toBe("Qty: 1");
    expect(screen.getByTestId("order-line-unit-price").textContent).toBe("$249.00 each");
    expect(screen.getByTestId("order-line-total").textContent).toBe("$249.00");
  });

  it("renders financial summary: subtotal, shipping, tax, total", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    expect(screen.getByTestId("order-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("order-shipping").textContent).toBe("$15.00");
    expect(screen.getByTestId("order-tax").textContent).toBe("$19.92");
    expect(screen.getByTestId("order-total").textContent).toBe("$283.92");
  });

  it("renders shipping address card and delivery method details", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    const addressCard = screen.getByTestId("order-shipping-address");
    expect(addressCard.textContent).toContain("Elena Rostova");
    expect(addressCard.textContent).toContain("742 Evergreen Terrace");
    expect(addressCard.textContent).toContain("Suite 100");
    expect(addressCard.textContent).toContain("New York, NY 10001");
    expect(addressCard.textContent).toContain("Phone: +1 555-019-2834");

    const methodCard = screen.getByTestId("order-shipping-method");
    expect(methodCard.textContent).toContain("Express Shipping");
    expect(methodCard.textContent).toContain("1–2 business days");
    expect(methodCard.textContent).toContain("$15.00");
  });

  it("renders Continue Shopping link to /catalog", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce(mockOrder);

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    const link = screen.getByTestId("continue-shopping-link");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/catalog");
  });

  it("renders password-notice when order has a Quick Access password", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce({
      ...mockOrder,
      hasPassword: true,
    });

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    const passwordNotice = screen.getByTestId("password-notice");
    expect(passwordNotice).toBeTruthy();
    expect(passwordNotice.textContent).toContain("Quick Access password active");
    expect(passwordNotice.textContent).toContain(
      "You can sign in anytime using your email and password",
    );
  });

  it("does not render password-notice when order has no Quick Access password", async () => {
    getOrderByReferenceMock.mockResolvedValueOnce({
      ...mockOrder,
      hasPassword: false,
    });

    const ui = await OrderConfirmationPage({
      params: Promise.resolve({ reference: "JA-847291" }),
    });
    render(ui);

    expect(screen.queryByTestId("password-notice")).toBeNull();
  });
});
