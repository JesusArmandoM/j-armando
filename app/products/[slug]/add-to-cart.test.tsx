import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductDetailVariant } from "@/db/catalog.ts";

import { AddToCart } from "./add-to-cart";

const blushVariant: ProductDetailVariant = {
  id: "v-m-ivory",
  size: "M",
  color: "Ivory",
  colorHex: "#F3EDE2",
  stockQty: 12,
  priceOverrideCents: null,
};

const navyVariant: ProductDetailVariant = {
  id: "v-xl-navy",
  size: "XL",
  color: "Navy",
  colorHex: "#22304A",
  stockQty: 7,
  priceOverrideCents: 22900,
};

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okResponse(lineQuantity: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ lineQuantity }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddToCart", () => {
  it("shows a labelled quantity, a disabled button and a hint without a selected variant", () => {
    stubFetch(() => okResponse(1));
    render(<AddToCart />);

    const select = screen.getByLabelText("Quantity") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
    expect(select.value).toBe("1");

    const button = screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("add-to-cart-hint").textContent).toBe(
      "Select a size and color to add to cart.",
    );
  });

  it("posts only the variant id and quantity, then announces the line quantity with a cart link", async () => {
    let resolveResponse: (value: unknown) => void = () => {};
    const fetchMock = stubFetch(() => new Promise((resolve) => (resolveResponse = resolve)));

    render(<AddToCart variant={blushVariant} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    const pending = screen.getByRole("button", { name: "Adding…" }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cart/lines");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({
      variantId: blushVariant.id,
      quantity: 2,
    });
    expect(JSON.parse(init?.body as string)).not.toHaveProperty("priceCents");

    resolveResponse(okResponse(3));

    const status = await screen.findByTestId("add-to-cart-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toContain("Added to cart. 3 × M / Ivory in your cart.");
    expect(screen.getByRole("link", { name: "View cart" }).getAttribute("href")).toBe("/cart");
    expect((screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows the server's English message when the API rejects the add", async () => {
    stubFetch(() => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "This variant is no longer available." }),
    }));

    render(<AddToCart variant={blushVariant} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    const error = await screen.findByTestId("add-to-cart-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toBe("This variant is no longer available.");
  });

  it("shows a generic message when the network request fails", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });

    render(<AddToCart variant={blushVariant} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    const error = await screen.findByTestId("add-to-cart-error");
    expect(error.textContent).toBe(
      "We could not add this item to your cart. Please try again.",
    );
  });

  it("resets the confirmation when the selected variant changes", async () => {
    stubFetch(() => okResponse(2));

    const { rerender } = render(<AddToCart variant={blushVariant} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    await screen.findByTestId("add-to-cart-status");

    rerender(<AddToCart variant={navyVariant} />);

    await waitFor(() => {
      expect(screen.queryByTestId("add-to-cart-status")).toBeNull();
    });
    expect(screen.queryByTestId("add-to-cart-error")).toBeNull();
  });
});
