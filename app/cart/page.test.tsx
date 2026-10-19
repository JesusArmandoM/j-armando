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

import CartPage from "./page";

const summary: CartSummary = {
  lines: [
    {
      lineId: "line-1",
      variantId: "variant-1",
      productSlug: "double-breasted-linen-blazer",
      productName: "Double-Breasted Linen Blazer",
      size: "M",
      color: "Ivory",
      quantity: 2,
      unitPriceCents: 24900,
      lineTotalCents: 49800,
    },
  ],
  lineCount: 1,
  subtotalCents: 49800,
  currency: "USD",
};

beforeEach(() => {
  vi.restoreAllMocks();
  cookieState.value = undefined;
  cookieState.set.mockReset();
});

describe("CartPage", () => {
  it("renders lines, integer-cent unit/line totals and the USD tax-exclusive subtotal", async () => {
    cookieState.value = "session-token";
    const getCartSummaryMock = vi
      .spyOn(cartDb, "getCartSummary")
      .mockResolvedValue(summary);

    const ui = await CartPage();
    render(ui);

    expect(screen.getByRole("heading", { level: 1, name: "Your Cart" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Double-Breasted Linen Blazer" }).getAttribute("href"),
    ).toBe("/products/double-breasted-linen-blazer");
    expect(screen.getByText("Size M · Ivory")).toBeTruthy();
    expect(screen.getByTestId("cart-line-unit").textContent).toBe("$249.00");
    expect(screen.getByTestId("cart-line-quantity").textContent).toBe("2");
    expect(screen.getByTestId("cart-line-total").textContent).toBe("$498.00");
    expect(screen.getByTestId("cart-subtotal").textContent).toContain("Subtotal");
    expect(screen.getByTestId("cart-subtotal").textContent).toContain("$498.00");
    expect(
      screen.getByText(
        "USD, tax-exclusive. Taxes and shipping calculated at checkout.",
      ),
    ).toBeTruthy();

    expect(getCartSummaryMock).toHaveBeenCalledWith({}, "session-token");

    // Steppers and remove button are present
    expect(screen.getByTestId("cart-line-dec")).toBeTruthy();
    expect(screen.getByTestId("cart-line-inc")).toBeTruthy();
    expect(screen.getByTestId("cart-line-remove")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /checkout/i })).toBeNull();
  });

  it("renders the empty state without a database call or a cookie when the visitor has no cart cookie", async () => {
    const getCartSummaryMock = vi.spyOn(cartDb, "getCartSummary").mockResolvedValue(summary);

    const ui = await CartPage();
    render(ui);

    expect(screen.getByText("Your cart is empty.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe(
      "/catalog",
    );
    expect(getCartSummaryMock).not.toHaveBeenCalled();
    expect(cookieState.set).not.toHaveBeenCalled();
  });

  it("treats an active cookie whose cart has no lines as empty", async () => {
    cookieState.value = "session-token";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValue(undefined);

    const ui = await CartPage();
    render(ui);

    expect(screen.getByText("Your cart is empty.")).toBeTruthy();
    expect(cookieState.set).not.toHaveBeenCalled();
  });

  it("renders a temporary-unavailable state when the cart read fails", async () => {
    cookieState.value = "session-token";
    vi.spyOn(cartDb, "getCartSummary").mockRejectedValue(new Error("database unavailable"));

    const ui = await CartPage();
    render(ui);

    expect(screen.getByTestId("cart-unavailable").textContent).toContain(
      "Your cart is temporarily unavailable.",
    );
    expect(screen.getByRole("link", { name: "Browse the collection" }).getAttribute("href")).toBe(
      "/catalog",
    );
  });

  it("renders cart notifications when items were adjusted due to stock", async () => {
    cookieState.value = "session-token";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValue({
      ...summary,
      notifications: ["Quantity for Double-Breasted Linen Blazer was adjusted to 1 based on available stock."],
    });

    const ui = await CartPage();
    render(ui);

    const notifications = screen.getByTestId("cart-notifications");
    expect(notifications).toBeTruthy();
    expect(notifications.textContent).toContain("Quantity for Double-Breasted Linen Blazer was adjusted to 1 based on available stock.");
  });

  it("renders out-of-stock removal notification even when the cart becomes empty", async () => {
    cookieState.value = "session-token";
    vi.spyOn(cartDb, "getCartSummary").mockResolvedValue({
      lines: [],
      lineCount: 0,
      subtotalCents: 0,
      currency: "USD",
      notifications: ["Double-Breasted Linen Blazer is out of stock and was removed from your cart."],
    });

    const ui = await CartPage();
    render(ui);

    expect(screen.getByTestId("cart-empty")).toBeTruthy();
    const notifications = screen.getByTestId("cart-notifications");
    expect(notifications).toBeTruthy();
    expect(notifications.textContent).toContain("Double-Breasted Linen Blazer is out of stock and was removed from your cart.");
  });
});
