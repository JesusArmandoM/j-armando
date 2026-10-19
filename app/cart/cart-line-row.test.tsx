import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

import type { CartSummaryLine } from "@/db/cart.ts";
import { CartLineRow } from "./cart-line-row";

const sampleLine: CartSummaryLine = {
  lineId: "line-123",
  variantId: "variant-123",
  productSlug: "double-breasted-linen-blazer",
  productName: "Double-Breasted Linen Blazer",
  size: "M",
  color: "Ivory",
  quantity: 2,
  unitPriceCents: 24900,
  lineTotalCents: 49800,
};

describe("CartLineRow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refreshMock.mockReset();
    global.fetch = vi.fn();
  });

  it("renders product name, size, unit price, quantity and line total", () => {
    render(<CartLineRow line={sampleLine} />);

    expect(screen.getByText("Double-Breasted Linen Blazer")).toBeTruthy();
    expect(screen.getByText("Size M · Ivory")).toBeTruthy();
    expect(screen.getByTestId("cart-line-unit").textContent).toBe("$249.00");
    expect(screen.getByTestId("cart-line-quantity").textContent).toBe("2");
    expect(screen.getByTestId("cart-line-total").textContent).toBe("$498.00");
  });

  it("disables decrement button when quantity is 1", () => {
    render(<CartLineRow line={{ ...sampleLine, quantity: 1 }} />);

    const decBtn = screen.getByTestId("cart-line-dec");
    expect(decBtn.hasAttribute("disabled")).toBe(true);

    const incBtn = screen.getByTestId("cart-line-inc");
    expect(incBtn.hasAttribute("disabled")).toBe(false);
  });

  it("disables increment button when quantity is 10", () => {
    render(<CartLineRow line={{ ...sampleLine, quantity: 10 }} />);

    const incBtn = screen.getByTestId("cart-line-inc");
    expect(incBtn.hasAttribute("disabled")).toBe(true);

    const decBtn = screen.getByTestId("cart-line-dec");
    expect(decBtn.hasAttribute("disabled")).toBe(false);
  });

  it("calls PATCH /api/cart/lines with incremented quantity and refreshes router", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ lineId: "line-123", lineQuantity: 3 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<CartLineRow line={sampleLine} />);

    fireEvent.click(screen.getByTestId("cart-line-inc"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/cart/lines", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: "line-123", quantity: 3 }),
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("calls PATCH /api/cart/lines with decremented quantity and refreshes router", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ lineId: "line-123", lineQuantity: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<CartLineRow line={sampleLine} />);

    fireEvent.click(screen.getByTestId("cart-line-dec"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/cart/lines", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: "line-123", quantity: 1 }),
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("calls DELETE /api/cart/lines when remove is clicked and refreshes router", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ lineId: "line-123", removed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<CartLineRow line={sampleLine} />);

    fireEvent.click(screen.getByTestId("cart-line-remove"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/cart/lines", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: "line-123" }),
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("shows error message when request fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Failed to update item." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<CartLineRow line={sampleLine} />);

    fireEvent.click(screen.getByTestId("cart-line-inc"));

    await waitFor(() => {
      expect(screen.getByTestId("cart-line-error").textContent).toBe("Failed to update item.");
    });
  });

  it("disables increment button when quantity equals availableStock", () => {
    render(<CartLineRow line={{ ...sampleLine, quantity: 3, availableStock: 3 }} />);

    const incBtn = screen.getByTestId("cart-line-inc");
    expect(incBtn.hasAttribute("disabled")).toBe(true);

    const decBtn = screen.getByTestId("cart-line-dec");
    expect(decBtn.hasAttribute("disabled")).toBe(false);
  });

  it("renders stock adjustment notice when line was adjusted", () => {
    render(
      <CartLineRow
        line={{ ...sampleLine, quantity: 2, availableStock: 2, stockAdjusted: true }}
      />,
    );

    const warning = screen.getByTestId("cart-line-stock-warning");
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain("Quantity adjusted to 2 based on available stock.");
  });
});
