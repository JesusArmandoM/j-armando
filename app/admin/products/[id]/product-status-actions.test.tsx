import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

import { ProductStatusActions } from "./product-status-actions.tsx";

describe("ProductStatusActions component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders publish and archive action buttons for a draft product", () => {
    render(
      <ProductStatusActions
        productId="prod-1"
        initialStatus="draft"
        productSlug="cashmere-coat"
      />,
    );

    expect(screen.getByTestId("product-status-actions")).toBeDefined();
    expect(screen.getByTestId("publish-product-btn")).toBeDefined();
    expect(screen.getByTestId("archive-product-btn")).toBeDefined();
    expect(screen.queryByTestId("revert-draft-btn")).toBeNull();
    expect(screen.getByText(/Hidden from storefront catalog/i)).toBeDefined();
  });

  it("publishes a draft product and calls router.refresh()", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          product: {
            id: "prod-1",
            status: "published",
            slug: "cashmere-coat",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ProductStatusActions
        productId="prod-1"
        initialStatus="draft"
        productSlug="cashmere-coat"
      />,
    );

    const publishBtn = screen.getByTestId("publish-product-btn");
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/admin/products/prod-1/status",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("status-action-success").textContent).toContain(
        "Product status updated to published",
      );
    });

    expect(mockRefresh).toHaveBeenCalled();

    // In published state: shows revert to draft and archive buttons
    expect(screen.getByTestId("revert-draft-btn")).toBeDefined();
    expect(screen.getByTestId("archive-product-btn")).toBeDefined();
    expect(screen.queryByTestId("publish-product-btn")).toBeNull();
  });

  it("renders archive and revert to draft buttons for a published product", () => {
    render(
      <ProductStatusActions
        productId="prod-2"
        initialStatus="published"
        productSlug="silk-shirt"
      />,
    );

    expect(screen.getByTestId("archive-product-btn")).toBeDefined();
    expect(screen.getByTestId("revert-draft-btn")).toBeDefined();
    expect(screen.queryByTestId("publish-product-btn")).toBeNull();
    expect(screen.getByText(/Visible in storefront at/i)).toBeDefined();
  });

  it("renders publish and revert to draft buttons for an archived product", () => {
    render(
      <ProductStatusActions
        productId="prod-3"
        initialStatus="archived"
        productSlug="linen-trousers"
      />,
    );

    expect(screen.getByTestId("publish-product-btn")).toBeDefined();
    expect(screen.getByTestId("revert-draft-btn")).toBeDefined();
    expect(screen.queryByTestId("archive-product-btn")).toBeNull();
  });

  it("shows an error message when the API request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          error: "Database constraint error.",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ProductStatusActions
        productId="prod-1"
        initialStatus="draft"
        productSlug="cashmere-coat"
      />,
    );

    fireEvent.click(screen.getByTestId("publish-product-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("status-action-error").textContent).toBe(
        "Database constraint error.",
      );
    });

    // Should remain in draft state
    expect(screen.getByTestId("publish-product-btn")).toBeDefined();
  });
});
