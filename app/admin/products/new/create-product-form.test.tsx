import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

import { CreateProductForm } from "./create-product-form.tsx";

const sampleCategories = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "coats",
    name: "Coats",
    sortOrder: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "blazers",
    name: "Blazers",
    sortOrder: 2,
  },
];

describe("CreateProductForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid input with a clear validation error and does not call the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<CreateProductForm categories={sampleCategories} />);

    fireEvent.click(screen.getByTestId("submit-product-btn"));

    const errorAlert = await screen.findByTestId("create-product-error");
    expect(errorAlert.textContent).toContain("Product name is required.");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("allows adding a second variant, setting per-variant stock, and submits to POST /api/admin/products", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          product: { id: "created-prod-99" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    render(<CreateProductForm categories={sampleCategories} />);

    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Double-Faced Cashmere Wrap Coat" },
    });
    fireEvent.change(screen.getByLabelText(/Base Price/i), {
      target: { value: "495.00" },
    });
    fireEvent.change(screen.getByLabelText(/Editorial Description/i), {
      target: { value: "Hand-finished wrap coat in double-faced cashmere." },
    });
    fireEvent.change(screen.getByLabelText(/Composition/i), {
      target: { value: "100% Cashmere" },
    });
    fireEvent.change(screen.getByLabelText(/Care Instructions/i), {
      target: { value: "Specialist dry clean only." },
    });

    // Configure Variant 1
    fireEvent.change(screen.getByLabelText("Variant 1 Size"), {
      target: { value: "S" },
    });
    fireEvent.change(screen.getByLabelText("Variant 1 Color"), {
      target: { value: "Camel" },
    });
    fireEvent.change(screen.getByLabelText("Variant 1 Stock"), {
      target: { value: "12" },
    });

    // Add Variant 2
    fireEvent.click(screen.getByTestId("add-variant-btn"));

    fireEvent.change(screen.getByLabelText("Variant 2 Size"), {
      target: { value: "M" },
    });
    fireEvent.change(screen.getByLabelText("Variant 2 Color"), {
      target: { value: "Camel" },
    });
    fireEvent.change(screen.getByLabelText("Variant 2 Stock"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByTestId("submit-product-btn"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/admin/products");
    expect(options?.method).toBe("POST");
    const sentBody = JSON.parse(String(options?.body));
    expect(sentBody.name).toBe("Double-Faced Cashmere Wrap Coat");
    expect(sentBody.basePriceDollars).toBe("495.00");
    expect(sentBody.variants).toEqual([
      { size: "S", color: "Camel", colorHex: "#121212", stockQty: "12" },
      { size: "M", color: "Camel", colorHex: "#121212", stockQty: "8" },
    ]);

    expect(pushMock).toHaveBeenCalledWith("/admin/products/created-prod-99");
    expect(refreshMock).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
