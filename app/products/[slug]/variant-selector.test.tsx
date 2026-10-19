import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductDetailVariant } from "@/db/catalog.ts";

import { VariantSelector } from "./variant-selector";

vi.mock("next/navigation", () => ({
  usePathname: () => "/products/double-breasted-linen-blazer",
}));

function variant(
  size: "XS" | "S" | "M" | "L" | "XL",
  color: string,
  stockQty: number,
  priceOverrideCents: number | null = null,
): ProductDetailVariant {
  return {
    id: `${size}-${color}`,
    size,
    color,
    colorHex: color === "Camel" ? "#C19A6B" : "#3B4045",
    stockQty,
    priceOverrideCents,
  };
}

const overcoat: ProductDetailVariant[] = [
  variant("S", "Camel", 0),
  variant("M", "Camel", 14),
  variant("L", "Camel", 9),
  variant("M", "Charcoal", 11),
  variant("L", "Charcoal", 6),
];

const blazer: ProductDetailVariant[] = [
  variant("S", "Ivory", 8),
  variant("M", "Ivory", 12),
  variant("L", "Ivory", 5),
  variant("M", "Navy", 10),
  variant("XL", "Navy", 7, 22900),
];

describe("VariantSelector", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders the base price and asks for both dimensions before a selection", () => {
    render(
      <VariantSelector variants={blazer} basePriceCents={24900} initialSelection={{}} />,
    );

    const price = screen.getByTestId("product-price");
    expect(price.textContent).toContain("$249.00");
    expect(price.textContent?.toLowerCase()).toContain("tax-exclusive");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size and color to see availability.",
    );
    expect(screen.getByTestId("variant-live-region").getAttribute("aria-live")).toBe("polite");

    // The add-to-cart control is mounted but disabled until a variant resolves.
    expect(screen.getByTestId("add-to-cart")).toBeTruthy();
    expect(screen.getByTestId("add-to-cart-hint").textContent).toBe(
      "Select a size and color to add to cart.",
    );
    expect((screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("updates price, stock message and URL when a base-price variant is selected", () => {
    render(
      <VariantSelector variants={blazer} basePriceCents={24900} initialSelection={{}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a color to see availability.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Ivory" }));

    expect(screen.getByTestId("product-price").textContent).toContain("$249.00");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "In stock — 12 available.",
    );
    expect(screen.getByTestId("variant-live-region").textContent).toBe(
      "M / Ivory. $249.00. In stock — 12 available.",
    );
    expect(window.location.pathname).toBe("/products/double-breasted-linen-blazer");
    expect(window.location.search).toBe("?size=M&color=Ivory");
    expect(screen.getByRole("button", { name: "M" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Ivory" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    // A selectable variant enables the add control and clears the hint.
    expect(screen.queryByTestId("add-to-cart-hint")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("uses the variant price override instead of the base price", () => {
    render(
      <VariantSelector variants={blazer} basePriceCents={24900} initialSelection={{}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "XL" }));
    fireEvent.click(screen.getByRole("button", { name: "Navy" }));

    expect(screen.getByTestId("product-price").textContent).toContain("$229.00");
    expect(screen.getByTestId("product-price").textContent).not.toContain("$249.00");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "In stock — 7 available.",
    );
    expect(window.location.search).toBe("?size=XL&color=Navy");
  });

  it("keeps an out-of-stock size visibly disabled and cannot select it", () => {
    render(
      <VariantSelector variants={overcoat} basePriceCents={34900} initialSelection={{}} />,
    );

    // Before any color is chosen, S has no available variant.
    const smallBefore = screen.getByRole("button", { name: "S — Out of stock" });
    expect(smallBefore.getAttribute("aria-disabled")).toBe("true");
    expect(smallBefore.getAttribute("data-state")).toBe("out_of_stock");
    // Still focusable: no native disabled attribute.
    expect(smallBefore.hasAttribute("disabled")).toBe(false);

    fireEvent.click(smallBefore);
    expect(screen.getByRole("button", { name: "S — Out of stock" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(window.location.search).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Camel" }));

    // S / Camel exists but has zero stock: disabled with an out-of-stock reason.
    const smallAfter = screen.getByRole("button", { name: "S — Out of stock" });
    expect(smallAfter.getAttribute("aria-disabled")).toBe("true");
    const historyLength = window.history.length;
    fireEvent.click(smallAfter);

    expect(window.history.length).toBe(historyLength);
    expect(window.location.search).toBe("?color=Camel");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size to see availability.",
    );
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
  });

  it("restores a deep-linked selection and drops an invalid one", () => {
    const { unmount } = render(
      <VariantSelector
        variants={blazer}
        basePriceCents={24900}
        initialSelection={{ size: "XL", color: "Navy" }}
      />,
    );

    expect(screen.getByRole("button", { name: "XL" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Navy" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("product-price").textContent).toContain("$229.00");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "In stock — 7 available.",
    );
    unmount();

    // The server page parses invalid pairs to {}, which renders the empty state.
    render(
      <VariantSelector variants={overcoat} basePriceCents={34900} initialSelection={{}} />,
    );
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size and color to see availability.",
    );
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
  });

  it("exposes labelled groups, pressed/disabled ARIA state and a single live region", () => {
    render(
      <VariantSelector variants={overcoat} basePriceCents={34900} initialSelection={{ color: "Charcoal" }} />,
    );

    expect(screen.getByRole("group", { name: "Size" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Color" })).toBeTruthy();

    // Charcoal only exists in M and L; S carries a reason-bearing accessible name.
    expect(screen.getByRole("button", { name: "S — Not available in Charcoal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "M" }).getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("button", { name: "Charcoal" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    // Every variant option is keyboard focusable (no native disabled).
    const optionButtons = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-state"));
    expect(optionButtons.length).toBeGreaterThan(0);
    for (const button of optionButtons) {
      expect(button.hasAttribute("disabled")).toBe(false);
    }

    expect(screen.getAllByTestId("variant-live-region")).toHaveLength(1);
  });
});
