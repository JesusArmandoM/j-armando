import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { FulfillmentControls } from "./fulfillment-controls.tsx";

describe("FulfillmentControls component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the timeline and an action button to mark as preparing when unfulfilled and paid", () => {
    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="unfulfilled"
        paymentStatus="paid"
      />,
    );

    expect(screen.getByTestId("admin-order-fulfillment-section")).toBeDefined();
    expect(
      screen.getByTestId("admin-fulfillment-step-unfulfilled").className,
    ).toContain("admin-order-fulfillment-step--active");

    const btn = screen.getByTestId("admin-fulfillment-advance-btn");
    expect(btn.textContent).toBe("Mark as Preparing");
  });

  it("advances status to preparing on click, calls API, displays success and triggers router.refresh()", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        order: { fulfillmentStatus: "preparing" },
      }),
    } as Response);

    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="unfulfilled"
        paymentStatus="paid"
      />,
    );

    const btn = screen.getByTestId("admin-fulfillment-advance-btn");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/orders/JA-123456/fulfillment",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fulfillmentStatus: "preparing" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("admin-fulfillment-success").textContent).toContain(
        "Fulfillment status updated to preparing",
      );
      expect(refreshMock).toHaveBeenCalled();
    });

    // Button should now offer the next step: Mark as Shipped
    expect(screen.getByTestId("admin-fulfillment-advance-btn").textContent).toBe(
      "Mark as Shipped",
    );
  });

  it("displays an error alert when the fulfillment API returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        ok: false,
        error: "Cannot transition fulfillment from 'unfulfilled' to 'preparing'.",
      }),
    } as Response);

    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="unfulfilled"
        paymentStatus="paid"
      />,
    );

    const btn = screen.getByTestId("admin-fulfillment-advance-btn");
    fireEvent.click(btn);

    await waitFor(() => {
      const err = screen.getByTestId("admin-fulfillment-error");
      expect(err.textContent).toContain("Cannot transition fulfillment");
    });
  });

  it("renders unpaid notice and hides advance button when payment status is not paid", () => {
    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="unfulfilled"
        paymentStatus="created"
      />,
    );

    expect(screen.getByTestId("admin-fulfillment-unpaid-notice")).toBeDefined();
    expect(screen.getByTestId("admin-fulfillment-unpaid-notice").textContent).toContain(
      "Order payment status is created",
    );
    expect(screen.queryByTestId("admin-fulfillment-advance-btn")).toBeNull();
  });

  it("renders Mark as Shipped when current status is preparing", () => {
    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="preparing"
        paymentStatus="paid"
      />,
    );

    expect(
      screen.getByTestId("admin-fulfillment-step-preparing").className,
    ).toContain("admin-order-fulfillment-step--active");
    expect(
      screen.getByTestId("admin-fulfillment-step-unfulfilled").className,
    ).toContain("admin-order-fulfillment-step--completed");

    const btn = screen.getByTestId("admin-fulfillment-advance-btn");
    expect(btn.textContent).toBe("Mark as Shipped");
  });

  it("renders Mark as Delivered when current status is shipped", () => {
    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="shipped"
        paymentStatus="paid"
      />,
    );

    expect(
      screen.getByTestId("admin-fulfillment-step-shipped").className,
    ).toContain("admin-order-fulfillment-step--active");

    const btn = screen.getByTestId("admin-fulfillment-advance-btn");
    expect(btn.textContent).toBe("Mark as Delivered");
  });

  it("renders completion notice with no advance button when status is delivered", () => {
    render(
      <FulfillmentControls
        reference="JA-123456"
        initialFulfillmentStatus="delivered"
        paymentStatus="paid"
      />,
    );

    expect(
      screen.getByTestId("admin-fulfillment-step-delivered").className,
    ).toContain("admin-order-fulfillment-step--active");

    expect(
      screen.getByTestId("admin-fulfillment-complete-message").textContent,
    ).toContain("Order has been delivered. Fulfillment is complete.");
    expect(screen.queryByTestId("admin-fulfillment-advance-btn")).toBeNull();
  });
});
