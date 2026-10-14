import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./product-card";
import CatalogPage from "./page";
import * as catalogDb from "@/db/catalog.ts";

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
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
  it("renders products in the responsive grid", async () => {
    vi.spyOn(catalogDb, "listPublishedCatalogProducts").mockResolvedValueOnce(mockProducts);

    const ui = await CatalogPage();
    render(ui);

    expect(screen.getByRole("heading", { level: 1, name: "Collection" })).toBeTruthy();
    const grid = screen.getByTestId("catalog-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("catalog__grid");

    const cards = screen.getAllByTestId("product-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Longline Wool Overcoat")).toBeTruthy();
    expect(screen.getByText("Double-Breasted Linen Blazer")).toBeTruthy();
  });

  it("renders empty state when no published products exist", async () => {
    vi.spyOn(catalogDb, "listPublishedCatalogProducts").mockResolvedValueOnce([]);

    const ui = await CatalogPage();
    render(ui);

    expect(screen.getByTestId("catalog-empty")).toBeTruthy();
    expect(screen.getByText("No garments currently available")).toBeTruthy();
  });
});
