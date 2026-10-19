import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "ja_cart_session" && cookieState.value !== undefined
        ? { name, value: cookieState.value }
        : undefined,
    set: cookieState.set,
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

import * as cartDb from "@/db/cart.ts";
import type { CartSummary } from "@/db/cart.ts";
import * as checkoutDb from "@/db/checkout.ts";
import type { CheckoutSessionWithShipping } from "@/db/checkout.ts";
import type { ShippingMethod } from "@/db/schema/index.ts";

import CheckoutPage from "./page";

const mockSummary: CartSummary = {
  lines: [
    {
      lineId: "line-1",
      variantId: "variant-1",
      productSlug: "double-breasted-linen-blazer",
      productName: "Double-Breasted Linen Blazer",
      size: "M",
      color: "Ivory",
      quantity: 1,
      unitPriceCents: 24900,
      lineTotalCents: 24900,
    },
  ],
  lineCount: 1,
  subtotalCents: 24900,
  currency: "USD",
};

const mockShippingMethods: ShippingMethod[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "standard",
    name: "Standard Shipping",
    description: "Free standard shipping across the United States.",
    costCents: 0,
    deliveryEstimate: "3–5 business days",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "express",
    name: "Express Shipping",
    description: "Flat-rate express shipping across the United States.",
    costCents: 1500,
    deliveryEstimate: "1–2 business days",
  },
];

const mockCheckoutSession: CheckoutSessionWithShipping = {
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
  shippingMethodId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  shippingMethod: null,
};

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cookieState.value = undefined;
    vi.spyOn(checkoutDb, "listShippingMethods").mockResolvedValue(
      mockShippingMethods,
    );
  });

  it("renders empty checkout state when no cart session cookie is present", async () => {
    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("checkout-empty")).toBeTruthy();
    expect(screen.getByText("Your Cart is Empty")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue Shopping" })).toBeTruthy();
  });

  it("renders empty checkout state when cart has 0 lines", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce({
      lines: [],
      lineCount: 0,
      subtotalCents: 0,
      currency: "USD",
    });
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce(undefined);

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("checkout-empty")).toBeTruthy();
  });

  it("renders temporary unavailable state when database read fails", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockRejectedValueOnce(
      new Error("db down"),
    );

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("checkout-unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Return to Cart" })).toBeTruthy();
  });

  it("renders order summary and checkout flow when cart has items without chosen shipping", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce(undefined);

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("checkout-page")).toBeTruthy();
    expect(screen.getByTestId("checkout-flow")).toBeTruthy();
    expect(screen.getByTestId("checkout-order-summary")).toBeTruthy();

    // Order summary checks
    expect(screen.getByText("Double-Breasted Linen Blazer")).toBeTruthy();
    expect(screen.getByText("Size M · Ivory · Qty 1")).toBeTruthy();
    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("summary-shipping-hint").textContent).toBe(
      "Calculated next step",
    );
    expect(screen.getByTestId("summary-tax-hint").textContent).toBe(
      "Calculated from address",
    );
    expect(screen.getByTestId("summary-total").textContent).toBe("$249.00");
    expect(screen.getByText(/tax-exclusive/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit Cart" }).getAttribute("href")).toBe("/cart");

    // Checkout form is rendered in initial mode
    expect(screen.getByTestId("input-email")).toBeTruthy();
  });

  it("renders completed summary card when checkoutSession already exists in database", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce(
      mockCheckoutSession,
    );

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("address-summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-email").textContent).toBe(
      "alexandra.vance@studio.com",
    );
    expect(screen.getByTestId("summary-recipient-name").textContent).toBe(
      "Alexandra Vance",
    );
    // Sales tax is calculated from NY address (8% of $249.00 = $19.92)
    expect(screen.getByTestId("summary-tax").textContent).toBe("$19.92");
    // Step 2 is ready
    expect(screen.getByTestId("shipping-step-ready")).toBeTruthy();
  });

  it("renders Order Summary with standard shipping ($0.00), NY sales tax ($19.92), and total ($268.92)", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce({
      ...mockCheckoutSession,
      shippingMethodId: mockShippingMethods[0].id,
      shippingMethod: mockShippingMethods[0],
    });

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("summary-shipping").textContent).toBe("$0.00");
    expect(screen.getByTestId("summary-tax").textContent).toBe("$19.92");
    expect(screen.getByTestId("summary-total").textContent).toBe("$268.92");

    // Step 2 shows completed standard shipping
    expect(screen.getByTestId("shipping-summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-shipping-name").textContent).toBe(
      "Standard Shipping",
    );
    // Step 3 is ready for payment
    expect(screen.getByTestId("payment-step-ready")).toBeTruthy();
    expect(screen.getByTestId("place-order-button")).toBeTruthy();
    expect(screen.getByTestId("payment-total-amount").textContent).toContain("$268.92");
  });

  it("renders Order Summary with express shipping ($15.00), NY sales tax ($19.92), and total ($283.92)", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce({
      ...mockCheckoutSession,
      shippingMethodId: mockShippingMethods[1].id,
      shippingMethod: mockShippingMethods[1],
    });

    const ui = await CheckoutPage();
    render(ui);

    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("summary-shipping").textContent).toBe("$15.00");
    expect(screen.getByTestId("summary-tax").textContent).toBe("$19.92");
    expect(screen.getByTestId("summary-total").textContent).toBe("$283.92");

    // Step 2 shows completed express shipping
    expect(screen.getByTestId("shipping-summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-shipping-name").textContent).toBe(
      "Express Shipping",
    );
    // Step 3 is ready for payment
    expect(screen.getByTestId("payment-step-ready")).toBeTruthy();
    expect(screen.getByTestId("place-order-button")).toBeTruthy();
    expect(screen.getByTestId("payment-total-amount").textContent).toContain("$283.92");
  });

  it("recalculates sales tax when shipping destination state changes (CA 7.25%)", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce({
      ...mockCheckoutSession,
      state: "CA",
      shippingMethodId: mockShippingMethods[0].id,
      shippingMethod: mockShippingMethods[0],
    });

    const ui = await CheckoutPage();
    render(ui);

    // CA tax is 7.25%: 24900 * 0.0725 = 1805 cents ($18.05)
    // Total: 24900 + 0 + 1805 = 26705 ($267.05)
    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("summary-shipping").textContent).toBe("$0.00");
    expect(screen.getByTestId("summary-tax").textContent).toBe("$18.05");
    expect(screen.getByTestId("summary-total").textContent).toBe("$267.05");
  });

  it("calculates $0.00 sales tax for tax-exempt states like Oregon (OR)", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce({
      ...mockCheckoutSession,
      state: "OR",
      shippingMethodId: mockShippingMethods[1].id,
      shippingMethod: mockShippingMethods[1],
    });

    const ui = await CheckoutPage();
    render(ui);

    // OR tax is 0.00%: 24900 * 0 = 0 cents ($0.00)
    // Total: 24900 + 1500 + 0 = 26400 ($264.00)
    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");
    expect(screen.getByTestId("summary-shipping").textContent).toBe("$15.00");
    expect(screen.getByTestId("summary-tax").textContent).toBe("$0.00");
    expect(screen.getByTestId("summary-total").textContent).toBe("$264.00");
  });

  it("handles payment failure and preserves checkout flow allowing retry", async () => {
    cookieState.value = "mock_session";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValueOnce(mockSummary);
    vi.spyOn(checkoutDb, "getCheckoutSession").mockResolvedValueOnce({
      ...mockCheckoutSession,
      shippingMethodId: mockShippingMethods[0].id,
      shippingMethod: mockShippingMethods[0],
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        ok: false,
        error: "Payment failed: The payment was declined. Please try another payment method.",
        code: "payment_failed",
        retryable: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ui = await CheckoutPage();
    render(ui);

    // Order summary is intact
    expect(screen.getByTestId("summary-subtotal").textContent).toBe("$249.00");

    // Scenario controls are rendered
    expect(screen.getByTestId("simulated-scenario-group")).toBeTruthy();
    const failRadio = screen.getByTestId("scenario-fail");
    fireEvent.click(failRadio);

    const payBtn = screen.getByTestId("place-order-button");
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "fail" }),
      });
    });

    // Error banner is displayed
    const errorMsg = await screen.findByTestId("payment-error");
    expect(errorMsg.textContent).toBe(
      "Payment failed: The payment was declined. Please try another payment method.",
    );

    // Place order button remains enabled to allow retry
    expect((payBtn as HTMLButtonElement).disabled).toBe(false);

    vi.unstubAllGlobals();
  });
});

