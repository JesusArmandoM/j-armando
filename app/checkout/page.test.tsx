import { render, screen } from "@testing-library/react";
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
import type { CheckoutSession } from "@/db/schema/index.ts";

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

const mockCheckoutSession: CheckoutSession = {
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cookieState.value = undefined;
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

  it("renders order summary and checkout flow when cart has items", async () => {
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
    expect(screen.getByText("Calculated next step")).toBeTruthy();
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
  });
});
