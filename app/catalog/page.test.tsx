import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./product-card";
import CatalogPage from "./page";
import * as catalogDb from "@/db/catalog.ts";

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockProducts: catalogDb.CatalogProductSummary[] = [
  {
    id: "prod-1",
    slug: "longline-wool-overcoat",
    name: "Longline Wool Overcoat",
    description: "A full-length overcoat cut from a soft wool blend.",
    basePriceCents: 34900,
    currency: "USD",
    categoryName: "Coats",
    categorySlug: "coats",
    primaryImage: {
      path: "/images/products/longline-wool-overcoat-1.svg",
      altText: "Longline Wool Overcoat in Camel",
    },
  },
  {
    id: "prod-2",
    slug: "double-breasted-linen-blazer",
    name: "Double-Breasted Linen Blazer",
    description: "An unstructured double-breasted blazer in breathable linen.",
    basePriceCents: 24900,
    currency: "USD",
    categoryName: "Blazers",
    categorySlug: "blazers",
    primaryImage: {
      path: "/images/products/double-breasted-linen-blazer-1.svg",
      altText: "Double-Breasted Linen Blazer",
    },
  },
];

const mockOptions: catalogDb.CatalogFilterOptions = {
  categories: [
    { slug: "coats", name: "Coats" },
    { slug: "blazers", name: "Blazers" },
  ],
  sizes: ["XS", "S", "M", "L", "XL"],
  colors: ["Camel", "Ivory"],
};

function mockData(
  products: catalogDb.CatalogProductSummary[],
  options: catalogDb.CatalogFilterOptions = mockOptions,
) {
  vi.spyOn(catalogDb, "listPublishedCatalogProducts").mockResolvedValueOnce(products);
  vi.spyOn(catalogDb, "listPublishedCatalogFilterOptions").mockResolvedValueOnce(options);
}

const EMPTY_PARAMS: Record<string, string | string[] | undefined> = {};

describe("ProductCard component", () => {
  it("renders product name, category, image, and formatted USD price", () => {
    render(<ProductCard product={mockProducts[0]} />);

    expect(screen.getByText("Longline Wool Overcoat")).toBeTruthy();
    expect(screen.getByText("Coats")).toBeTruthy();
    expect(screen.getByText("$349.00")).toBeTruthy();

    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/images/products/longline-wool-overcoat-1.svg");
    expect(img.getAttribute("alt")).toBe("Longline Wool Overcoat in Camel");

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/products/longline-wool-overcoat");
  });
});

describe("CatalogPage component", () => {
  it("renders products in the responsive grid with a plural count", async () => {
    mockData(mockProducts);

    const ui = await CatalogPage({ searchParams: Promise.resolve(EMPTY_PARAMS) });
    render(ui);

    expect(screen.getByRole("heading", { level: 1, name: "Collection" })).toBeTruthy();
    const grid = screen.getByTestId("catalog-grid");
    expect(grid.className).toContain("catalog__grid");

    const cards = screen.getAllByTestId("product-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Longline Wool Overcoat")).toBeTruthy();
    expect(screen.getByText("Double-Breasted Linen Blazer")).toBeTruthy();
    expect(screen.getByTestId("catalog-results-count").textContent).toBe("2 garments");
  });

  it("renders the singular count for one result", async () => {
    mockData([mockProducts[0]]);

    const ui = await CatalogPage({
      searchParams: Promise.resolve({ category: "coats" }),
    });
    render(ui);

    expect(screen.getByTestId("catalog-results-count").textContent).toBe("1 garment");
  });

  it("renders the filter bar with the current selection", async () => {
    mockData(mockProducts);

    const ui = await CatalogPage({
      searchParams: Promise.resolve({ category: "coats", sort: "price-asc" }),
    });
    render(ui);

    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("coats");
    expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe("price-asc");
    expect(screen.getByRole("link", { name: "Reset" }).getAttribute("href")).toBe("/catalog");
  });

  it("renders the catalog-empty state when no products and no filters", async () => {
    mockData([]);

    const ui = await CatalogPage({ searchParams: Promise.resolve(EMPTY_PARAMS) });
    render(ui);

    expect(screen.getByTestId("catalog-empty")).toBeTruthy();
    expect(screen.getByText("No garments currently available")).toBeTruthy();
    expect(screen.queryByTestId("catalog-filtered-empty")).toBeNull();
  });

  it("renders a distinct filtered-empty state when filters match nothing", async () => {
    mockData([]);

    const ui = await CatalogPage({
      searchParams: Promise.resolve({ size: "XS", color: "Chartreuse" }),
    });
    render(ui);

    expect(screen.getByTestId("catalog-filtered-empty")).toBeTruthy();
    expect(screen.getByText("No matching garments")).toBeTruthy();
    expect(screen.queryByTestId("catalog-empty")).toBeNull();
    expect(screen.getByTestId("catalog-results-count").textContent).toBe("0 garments");
  });

  it("falls back gracefully when the database is unavailable", async () => {
    vi.spyOn(catalogDb, "listPublishedCatalogProducts").mockRejectedValueOnce(new Error("no db"));
    vi.spyOn(catalogDb, "listPublishedCatalogFilterOptions").mockRejectedValueOnce(new Error("no db"));

    const ui = await CatalogPage({ searchParams: Promise.resolve(EMPTY_PARAMS) });
    render(ui);

    expect(screen.getByTestId("catalog-empty")).toBeTruthy();
  });
});
