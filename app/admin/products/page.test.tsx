import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-products.ts", () => ({
  listAdminProducts: vi.fn(),
  getAdminProductById: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { getAdminProductById, listAdminProducts } from "@/db/admin-products.ts";
import AdminProductsPage from "./page.tsx";
import AdminProductDetailPage from "./[id]/page.tsx";

const getAdminSessionMock = vi.mocked(getAdminSession);
const listAdminProductsMock = vi.mocked(listAdminProducts);
const getAdminProductByIdMock = vi.mocked(getAdminProductById);

const authorizedSession = {
  status: "authorized" as const,
  account: {
    id: "adm-1",
    email: "admin@j-armando.store",
    createdAt: new Date(),
  },
  roles: ["customer", "admin"],
};

describe("AdminProductsPage and AdminProductDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the backoffice products table with status, USD price, variant count, and total stock", async () => {
    getAdminSessionMock.mockResolvedValueOnce(authorizedSession);
    listAdminProductsMock.mockResolvedValueOnce([
      {
        id: "prod-1",
        slug: "double-faced-cashmere-wrap-coat",
        name: "Double-Faced Cashmere Wrap Coat",
        status: "draft",
        basePriceCents: 49500,
        currency: "USD",
        categoryId: "cat-1",
        categoryName: "Coats",
        categorySlug: "coats",
        variantCount: 2,
        totalStock: 20,
        createdAt: new Date("2026-10-19T12:00:00Z"),
      },
    ]);

    const jsx = await AdminProductsPage();
    render(jsx);

    expect(screen.getByTestId("admin-products-page")).toBeDefined();
    expect(screen.getByTestId("create-product-link").getAttribute("href")).toBe(
      "/admin/products/new",
    );
    expect(screen.getByText("Double-Faced Cashmere Wrap Coat")).toBeDefined();
    expect(
      screen.getByTestId("product-status-double-faced-cashmere-wrap-coat").textContent,
    ).toBe("draft");
    expect(
      screen.getByTestId("product-price-double-faced-cashmere-wrap-coat").textContent,
    ).toBe("$495.00");
    expect(
      screen.getByTestId("product-variants-double-faced-cashmere-wrap-coat").textContent,
    ).toBe("2 variants");
    expect(
      screen.getByTestId("product-stock-double-faced-cashmere-wrap-coat").textContent,
    ).toBe("20 in stock");
  });

  it("renders the saved product detail page with per-variant stock quantities", async () => {
    getAdminSessionMock.mockResolvedValueOnce(authorizedSession);
    getAdminProductByIdMock.mockResolvedValueOnce({
      id: "prod-1",
      slug: "double-faced-cashmere-wrap-coat",
      name: "Double-Faced Cashmere Wrap Coat",
      description: "Hand-finished wrap coat in double-faced Italian cashmere.",
      composition: "100% Cashmere",
      care: "Specialist dry clean only.",
      status: "draft",
      basePriceCents: 49500,
      currency: "USD",
      categoryId: "cat-1",
      categoryName: "Coats",
      categorySlug: "coats",
      createdAt: new Date("2026-10-19T12:00:00Z"),
      updatedAt: new Date("2026-10-19T12:00:00Z"),
      images: [],
      variants: [
        {
          id: "v-1",
          productId: "prod-1",
          size: "S",
          color: "Camel",
          colorHex: "#b68f66",
          sku: "JA-DOUBLEFACE-S-CAMEL",
          stockQty: 12,
          stock: 12,
          priceOverrideCents: null,
          discontinued: false,
        },
        {
          id: "v-2",
          productId: "prod-1",
          size: "M",
          color: "Camel",
          colorHex: "#b68f66",
          sku: "JA-DOUBLEFACE-M-CAMEL",
          stockQty: 8,
          stock: 8,
          priceOverrideCents: null,
          discontinued: false,
        },
      ],
      totalStock: 20,
    });

    const jsx = await AdminProductDetailPage({
      params: Promise.resolve({ id: "prod-1" }),
    });
    render(jsx);

    expect(screen.getByTestId("detail-product-name").textContent).toBe(
      "Double-Faced Cashmere Wrap Coat",
    );
    expect(screen.getByTestId("detail-product-status").textContent).toBe("draft");
    expect(screen.getByTestId("detail-product-price").textContent).toBe("$495.00");
    expect(screen.getByTestId("variant-stock-S-Camel").textContent).toBe("12 in stock");
    expect(screen.getByTestId("variant-stock-M-Camel").textContent).toBe("8 in stock");
  });
});
