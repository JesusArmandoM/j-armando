import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShippingMethodForm } from "./shipping-method-form.tsx";
import type { ShippingMethodData } from "./shipping-method-form.tsx";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

const mockShippingMethods: ShippingMethodData[] = [
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

describe("ShippingMethodForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders available shipping methods with name, estimate, and formatted cost", () => {
    render(<ShippingMethodForm shippingMethods={mockShippingMethods} />);

    expect(screen.getByTestId("step-shipping-method")).toBeTruthy();
    expect(screen.getByTestId("shipping-step-ready")).toBeTruthy();
    expect(screen.getByTestId("shipping-methods-list")).toBeTruthy();

    // Standard Shipping
    expect(screen.getByTestId("shipping-name-standard").textContent).toBe(
      "Standard Shipping",
    );
    expect(screen.getByTestId("shipping-estimate-standard").textContent).toBe(
      "Estimated delivery: 3–5 business days",
    );
    expect(screen.getByTestId("shipping-cost-standard").textContent).toBe(
      "$0.00 (Free)",
    );

    // Express Shipping
    expect(screen.getByTestId("shipping-name-express").textContent).toBe(
      "Express Shipping",
    );
    expect(screen.getByTestId("shipping-estimate-express").textContent).toBe(
      "Estimated delivery: 1–2 business days",
    );
    expect(screen.getByTestId("shipping-cost-express").textContent).toBe("$15.00");

    expect(screen.getByTestId("checkout-submit-shipping")).toBeTruthy();
  });

  it("submits selected shipping method, triggers onSaved and router.refresh, and shows completed summary card", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        checkoutSession: {
          id: "session-1",
          shippingMethodId: mockShippingMethods[1].id,
          shippingMethod: mockShippingMethods[1],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onSavedMock = vi.fn();

    render(
      <ShippingMethodForm
        shippingMethods={mockShippingMethods}
        onSaved={onSavedMock}
      />,
    );

    // Select Express Shipping
    fireEvent.click(screen.getByTestId("radio-shipping-express"));

    // Submit
    fireEvent.click(screen.getByTestId("checkout-submit-shipping"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/checkout/shipping-method",
        expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shippingMethodId: mockShippingMethods[1].id }),
        }),
      );
    });

    // Summary card is displayed
    const summaryCard = await screen.findByTestId("shipping-summary-card");
    expect(summaryCard).toBeTruthy();
    expect(screen.getByTestId("summary-shipping-name").textContent).toBe(
      "Express Shipping",
    );
    expect(screen.getByTestId("summary-shipping-estimate").textContent).toBe(
      "Estimated delivery: 1–2 business days",
    );
    expect(screen.getByTestId("summary-shipping-cost").textContent).toBe("$15.00");
    expect(screen.getByTestId("shipping-step-completed")).toBeTruthy();

    expect(onSavedMock).toHaveBeenCalledWith(mockShippingMethods[1]);
    expect(refreshMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("displays server error message when API responds with an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Please complete contact and shipping address first.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShippingMethodForm shippingMethods={mockShippingMethods} />);

    fireEvent.click(screen.getByTestId("checkout-submit-shipping"));

    const alert = await screen.findByTestId("shipping-error");
    expect(alert.textContent).toBe(
      "Please complete contact and shipping address first.",
    );

    vi.unstubAllGlobals();
  });

  it("renders completed summary card directly when initialMethod is provided", () => {
    render(
      <ShippingMethodForm
        shippingMethods={mockShippingMethods}
        initialMethod={mockShippingMethods[0]}
      />,
    );

    expect(screen.getByTestId("shipping-summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-shipping-name").textContent).toBe(
      "Standard Shipping",
    );
    expect(screen.getByTestId("summary-shipping-cost").textContent).toBe(
      "$0.00 (Free)",
    );
    expect(screen.getByTestId("edit-shipping-method")).toBeTruthy();
  });

  it("clicking Modify opens selection options allowing method changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        checkoutSession: {
          id: "session-1",
          shippingMethodId: mockShippingMethods[1].id,
          shippingMethod: mockShippingMethods[1],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShippingMethodForm
        shippingMethods={mockShippingMethods}
        initialMethod={mockShippingMethods[0]}
      />,
    );

    // Initial state is summary card
    expect(screen.getByTestId("shipping-summary-card")).toBeTruthy();

    // Click modify
    fireEvent.click(screen.getByTestId("edit-shipping-method"));

    // Form is now visible with radio buttons
    expect(screen.getByTestId("shipping-methods-list")).toBeTruthy();
    const standardRadio = screen.getByTestId(
      "radio-shipping-standard",
    ) as HTMLInputElement;
    expect(standardRadio.checked).toBe(true);

    // Switch to express
    fireEvent.click(screen.getByTestId("radio-shipping-express"));
    fireEvent.click(screen.getByTestId("checkout-submit-shipping"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const updatedSummary = await screen.findByTestId("summary-shipping-name");
    expect(updatedSummary.textContent).toBe("Express Shipping");

    vi.unstubAllGlobals();
  });
});
