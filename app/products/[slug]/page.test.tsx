import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as catalogDb from "@/db/catalog.ts";
import type { Variant } from "@/db/schema/index.ts";
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

const mockVariants: Variant[] = [
  {
    id: "var-1",
    productId: "prod-1",
    size: "M",
    color: "Camel",
    colorHex: "#C19A6B",
    sku: "JA-OWO-CML-M",
    priceOverrideCents: null,
    stockQty: 14,
    discontinued: false,
  },
  {
    id: "var-2",
    productId: "prod-1",
    size: "L",
    color: "Charcoal",
    colorHex: "#3B4045",
    sku: "JA-OWO-CHR-L",
    priceOverrideCents: null,
    stockQty: 6,
    discontinued: false,
  },
  {
    id: "var-3",
    productId: "prod-1",
    size: "S",
    color: "Camel",
    colorHex: "#C19A6B",
    sku: "JA-OWO-CML-S-OLD",
    priceOverrideCents: null,
    stockQty: 0,
    discontinued: true,
  },
];

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

const mockSizeChart: catalogDb.SizeChartEntry[] = [
  {
    size: "XS",
    measurements: {
      chest: { min: 31, max: 32 },
      waist: { min: 24, max: 25 },
      hip: { min: 34, max: 35 },
      sleeve: { min: 30, max: 31 },
    },
  },
  {
    size: "S",
    measurements: {
      chest: { min: 33, max: 34 },
      waist: { min: 26, max: 27 },
      hip: { min: 36, max: 37 },
      sleeve: { min: 31, max: 32 },
    },
  },
  {
    size: "M",
    measurements: {
      chest: { min: 35, max: 36 },
      waist: { min: 28, max: 29 },
      hip: { min: 38, max: 39 },
      sleeve: { min: 32, max: 33 },
    },
  },
  {
    size: "L",
    measurements: {
      chest: { min: 37, max: 39 },
      waist: { min: 30, max: 32 },
      hip: { min: 40, max: 42 },
      sleeve: { min: 33, max: 34 },
    },
  },
  {
    size: "XL",
    measurements: {
      chest: { min: 40, max: 42 },
      waist: { min: 33, max: 35 },
      hip: { min: 43, max: 45 },
      sleeve: { min: 34, max: 35 },
    },
  },
];

const mockBlazerSizeChart: catalogDb.SizeChartEntry[] = [
  {
    size: "M",
    measurements: {
      chest: { min: 35, max: 36 },
      waist: { min: 28, max: 29 },
      hip: { min: 38, max: 39 },
    },
  },
  {
    size: "XL",
    measurements: {
      chest: { min: 40, max: 42 },
      waist: { min: 33, max: 35 },
      hip: { min: 43, max: 45 },
    },
  },
];

describe("ProductDetailPage", () => {
  beforeEach(() => {
    vi.spyOn(catalogDb, "listVariantsByProductId").mockResolvedValue(mockVariants);
    vi.spyOn(catalogDb, "listSizeChartByCategorySlug").mockImplementation(
      async (_db, categorySlug) =>
        categorySlug === "blazers" ? mockBlazerSizeChart : mockSizeChart,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("renders the published size guide for the sizes this product offers", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({ params: Promise.resolve({ slug: "longline-wool-overcoat" }) });
    render(ui);

    expect(screen.getByTestId("size-guide")).toBeTruthy();
    const table = within(screen.getByTestId("size-guide-table"));
    expect(table.getByRole("columnheader", { name: "Chest / bust" })).toBeTruthy();
    expect(table.getByRole("columnheader", { name: "Waist" })).toBeTruthy();
    expect(table.getByRole("rowheader", { name: "S" })).toBeTruthy();
    expect(table.getByRole("rowheader", { name: "M" })).toBeTruthy();
    expect(table.getByRole("rowheader", { name: "L" })).toBeTruthy();
    expect(table.queryByRole("rowheader", { name: "XS" })).toBeNull();
    expect(table.queryByRole("rowheader", { name: "XL" })).toBeNull();
    expect(table.getByText("35–36")).toBeTruthy();
    expect(table.getByText("28–29")).toBeTruthy();
  });

  it("omits the size guide when the chart read fails without breaking the page", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);
    vi.spyOn(catalogDb, "listSizeChartByCategorySlug").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const ui = await ProductDetailPage({ params: Promise.resolve({ slug: "longline-wool-overcoat" }) });
    render(ui);

    expect(screen.queryByTestId("size-guide")).toBeNull();
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
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

  it("mounts the try-on panel with non-discontinued variant context only", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
    });
    render(ui);

    expect(screen.getByTestId("try-on-panel")).toBeTruthy();
    const colors = screen.getByLabelText("Color") as HTMLSelectElement;
    expect([...colors.options].map((option) => option.value)).toEqual(["Camel"]);
    const sizes = screen.getByLabelText("Size") as HTMLSelectElement;
    expect([...sizes.options].map((option) => option.value)).toEqual(["M", "L"]);

    // The discontinued combination is not offered.
    expect([...colors.options].map((option) => option.textContent)).not.toContain(
      "Camel — Out of stock",
    );
  });

  it("still renders the page with an empty try-on variant list when variant reads fail", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);
    vi.spyOn(catalogDb, "listVariantsByProductId").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
    });
    render(ui);

    expect(screen.getByTestId("try-on-unavailable")).toBeTruthy();
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
  });

  it("scenario 5: keeps the rest of the product page working after a try-on failure", async () => {
    vi.spyOn(catalogDb, "getPublishedProductBySlug").mockResolvedValueOnce(mockProduct);
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: "provider body that must not render", code: "provider_error" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const ui = await ProductDetailPage({
      params: Promise.resolve({ slug: "longline-wool-overcoat" }),
    });
    render(ui);

    // Produce a real try-on failure through the panel.
    const photo = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "me.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Your photo"), { target: { files: [photo] } });
    fireEvent.click(screen.getByLabelText(/I understand this preview/));
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const alert = await screen.findByTestId("try-on-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe("The try-on couldn't be completed right now. Please try again.");
    expect(alert.textContent).not.toContain("provider body");
    // The failure is the only alert on the page and never a page-level error state.
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    // The product page itself still renders every element.
    expect(screen.getByRole("heading", { level: 1, name: "Longline Wool Overcoat" })).toBeTruthy();
    expect(screen.getByTestId("product-price").textContent).toContain("$349.00");
    expect(screen.getAllByTestId("product-gallery-thumbnail")).toHaveLength(3);
    expect(screen.getByTestId("size-guide")).toBeTruthy();
    expect(screen.getByTestId("variant-stock-message").textContent).toBe(
      "Select a size and color to see availability.",
    );
    expect(screen.getByRole("link", { name: "Collection" }).getAttribute("href")).toBe("/catalog");

    // The gallery still responds to a thumbnail click.
    const thumbnails = screen.getAllByTestId("product-gallery-thumbnail");
    fireEvent.click(thumbnails[1]);
    expect(screen.getAllByAltText(mockProduct.images[1].altText)).toHaveLength(2);

    // The variant selector still responds and updates price/stock messaging.
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Camel" }));
    await waitFor(() =>
      expect(screen.getByTestId("variant-stock-message").textContent).toBe(
        "In stock — 14 available.",
      ),
    );

    // The panel remains usable for a retry.
    expect((screen.getByLabelText("Your photo") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(
      false,
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
