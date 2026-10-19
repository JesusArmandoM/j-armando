import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as catalogDb from "@/db/catalog.ts";
import ProductDetailPage, { generateMetadata } from "./page";
import ProductNotFound from "./not-found";

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  usePathname: () => "/products/longline-wool-overcoat",
}));

const mockProduct: catalogDb.ProductDetail = {
  id: "prod-1",
  slug: "longline-wool-overcoat",
  name: "Longline Wool Overcoat",
  description: "A full-length overcoat cut from a soft wool blend.",
  composition: "Shell: 70% wool, 20% polyester, 10% cashmere.",
  care: "Dry clean only. Steam to refresh.",
  basePriceCents: 34900,
  currency: "USD",
  categoryName: "Coats",
  categorySlug: "coats",
  images: [
    {
      path: "/images/products/longline-wool-overcoat-1.svg",
      altText: "Longline Wool Overcoat in Camel, front view",
      position: 1,
    },
    {
      path: "/images/products/longline-wool-overcoat-2.svg",
      altText: "Longline Wool Overcoat in Camel, back view",
      position: 2,
    },
    {
      path: "/images/products/longline-wool-overcoat-3.svg",
      altText: "Longline Wool Overcoat fabric detail",
      position: 3,
    },
  ],
  variants: [
    {
      id: "v-s-camel",
      size: "S",
      color: "Camel",
      colorHex: "#C19A6B",
      stockQty: 0,
      priceOverrideCents: null,
    },
    {
      id: "v-m-camel",
      size: "M",
      color: "Camel",
      colorHex: "#C19A6B",
      stockQty: 14,
      priceOverrideCents: null,
    },
    {
      id: "v-l-camel",
      size: "L",
      color: "Camel",
      colorHex: "#C19A6B",
      stockQty: 9,
      priceOverrideCents: null,
    },
    {
      id: "v-m-charcoal",
      size: "M",
      color: "Charcoal",
      colorHex: "#3B4045",
      stockQty: 11,
      priceOverrideCents: null,
    },
    {
      id: "v-l-charcoal",
      size: "L",
      color: "Charcoal",
      colorHex: "#3B4045",
      stockQty: 6,
      priceOverrideCents: null,
    },
  ],
};

const mockBlazer: catalogDb.ProductDetail = {
  id: "prod-2",
  slug: "double-breasted-linen-blazer",
  name: "Double-Breasted Linen Blazer",
  description: "An unstructured double-breasted blazer in breathable linen.",
  composition: "Shell: 100% linen. Lining: 100% viscose.",
  care: "Dry clean only.",
  basePriceCents: 24900,
  currency: "USD",
  categoryName: "Blazers",
  categorySlug: "blazers",
  images: [],
  variants: [
    {
      id: "v-xl-navy",
      size: "XL",
      color: "Navy",
      colorHex: "#22304A",
      stockQty: 7,
      priceOverrideCents: 22900,
    },
    {
      id: "v-m-ivory",
      size: "M",
      color: "Ivory",
      colorHex: "#F3EDE2",
      stockQty: 12,
      priceOverrideCents: null,
    },
  ],
};

describe("ProductDetailPage", () => {
  it("scenario 1: renders name, USD price, description, composition and care", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({ params: Promise.resolve({ slug: "longline-wool-overcoat" }) });
    render(ui);

    expect(screen.getByRole("heading", { level: 1, name: "Longline Wool Overcoat" })).toBeTruthy();
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
    expect(screen.getByTestId("product-price").textContent?.toLowerCase()).toContain("tax-exclusive");
    expect(screen.getByText("A full-length overcoat cut from a soft wool blend.")).toBeTruthy();
    expect(screen.getByTestId("product-composition").textContent).toBe(
      "Shell: 70% wool, 20% polyester, 10% cashmere.",
    );
    expect(screen.getByTestId("product-care").textContent).toBe("Dry clean only. Steam to refresh.");
    expect(screen.getByRole("link", { name: "Collection" }).getAttribute("href")).toBe("/catalog");
  });

  it("scenario 2: gallery renders every image with its alt text, lowest position first", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({ params: Promise.resolve({ slug: "longline-wool-overcoat" }) });
    render(ui);

    for (const image of mockProduct.images) {
      expect(screen.getAllByAltText(image.altText).length).toBeGreaterThanOrEqual(1);
    }

    const thumbnails = screen.getAllByTestId("product-gallery-thumbnail");
    expect(thumbnails).toHaveLength(3);

    // The primary image is the lowest-position image (index 0).
    const primary = screen.getAllByAltText(mockProduct.images[0].altText)[0];
    expect(primary.getAttribute("src")).toBe(mockProduct.images[0].path);

    // Selecting a thumbnail swaps the primary image.
    fireEvent.click(thumbnails[1]);
    expect(screen.getAllByAltText(mockProduct.images[1].altText)).toHaveLength(2);
  });

  it("scenario 3: calls notFound() for an unknown slug", async () => {
    const { notFound } = await import("next/navigation");
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(undefined);

    await expect(
      ProductDetailPage({ params: Promise.resolve({ slug: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });

  it("scenario 4: calls notFound() for draft/archived slugs (repository returns undefined)", async () => {
    const { notFound } = await import("next/navigation");
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(undefined);

    await expect(
      ProductDetailPage({ params: Promise.resolve({ slug: "cropped-tweed-jacket" }) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });

  it("scenario 6: restores a valid deep-linked variant and its override price", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockBlazer);

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "double-breasted-linen-blazer" }),
      searchParams: Promise.resolve({ size: "XL", color: "Navy" }),
    });
    render(ui);

    expect(screen.getByTestId("product-price").textContent).toContain("$229.00");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "In stock — 7 available.",
    );
    expect(screen.getByRole("button", { name: "XL" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Navy" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("scenario 6: drops an out-of-stock deep link and renders the prompt", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
      searchParams: Promise.resolve({ size: "S", color: "Camel" }),
    });
    render(ui);

    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size and color to see availability.",
    );
    expect(
      screen.getByRole("button", { name: "S — Out of stock" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("scenario 6: ignores unknown deep-link values without erroring", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
      searchParams: Promise.resolve({ size: "XXL", color: "Neon" }),
    });
    render(ui);

    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size and color to see availability.",
    );
  });

  it("generateMetadata returns the product name as the page title", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
    });
    expect(metadata.title).toContain("Longline Wool Overcoat");
  });
});

describe("ProductNotFound", () => {
  it("renders the editorial 404 state with a link back to the catalog", () => {
    render(<ProductNotFound />);

    expect(screen.getByText("This garment is no longer available")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the collection" }).getAttribute("href")).toBe(
      "/catalog",
    );
  });
});
