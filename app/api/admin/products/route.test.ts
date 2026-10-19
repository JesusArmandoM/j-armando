// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-products.ts", () => ({
  listAdminProducts: vi.fn(),
  listAdminCategories: vi.fn(),
  createProductWithVariants: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import {
  createProductWithVariants,
  listAdminCategories,
  listAdminProducts,
} from "@/db/admin-products.ts";
import { GET, POST } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);
const listAdminProductsMock = vi.mocked(listAdminProducts);
const listAdminCategoriesMock = vi.mocked(listAdminCategories);
const createProductWithVariantsMock = vi.mocked(createProductWithVariants);

const mockAdminSession = {
  status: "authorized" as const,
  account: {
    id: "adm-1",
    email: "admin@j-armando.store",
    createdAt: new Date(),
  },
  roles: ["customer", "admin"],
};

describe("GET and POST /api/admin/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 when unauthenticated and 403 when forbidden", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });
    const res401 = await GET();
    expect(res401.status).toBe(401);
    expect(res401.headers.get("cache-control")).toBe("no-store");

    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: { id: "c-1", email: "user@example.com", createdAt: new Date() },
      roles: ["customer"],
    });
    const res403 = await GET();
    expect(res403.status).toBe(403);
    expect(res403.headers.get("cache-control")).toBe("no-store");
  });

  it("GET returns 200 with products and categories for an authorized admin", async () => {
    getAdminSessionMock.mockResolvedValueOnce(mockAdminSession);
    listAdminProductsMock.mockResolvedValueOnce([
      {
        id: "prod-1",
        slug: "tailored-blazer",
        name: "Tailored Blazer",
        status: "draft",
        basePriceCents: 28900,
        currency: "USD",
        categoryId: "cat-1",
        categoryName: "Blazers",
        categorySlug: "blazers",
        variantCount: 2,
        totalStock: 20,
        createdAt: new Date("2026-10-19T12:00:00Z"),
      },
    ]);
    listAdminCategoriesMock.mockResolvedValueOnce([
      { id: "cat-1", slug: "blazers", name: "Blazers", sortOrder: 1 },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.products).toHaveLength(1);
    expect(data.products[0].variantCount).toBe(2);
    expect(data.products[0].totalStock).toBe(20);
    expect(data.categories).toHaveLength(1);
  });

  it("POST returns 401 when unauthenticated and 403 when lacking admin role", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });
    const req1 = new Request("http://localhost:3016/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const res401 = await POST(req1);
    expect(res401.status).toBe(401);

    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: { id: "c-1", email: "user@example.com", createdAt: new Date() },
      roles: ["customer"],
    });
    const req2 = new Request("http://localhost:3016/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const res403 = await POST(req2);
    expect(res403.status).toBe(403);
    expect(createProductWithVariantsMock).not.toHaveBeenCalled();
  });

  it("POST returns 400 with clear validation error when payload is invalid", async () => {
    getAdminSessionMock.mockResolvedValueOnce(mockAdminSession);
    createProductWithVariantsMock.mockResolvedValueOnce({
      ok: false,
      error: "Product name is required.",
      fieldErrors: { name: "Product name is required." },
    });

    const req = new Request("http://localhost:3016/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Product name is required.");
    expect(data.fieldErrors.name).toBe("Product name is required.");
  });

  it("POST returns 201 with the created product and variants on valid input", async () => {
    getAdminSessionMock.mockResolvedValueOnce(mockAdminSession);
    createProductWithVariantsMock.mockResolvedValueOnce({
      ok: true,
      product: {
        id: "prod-new-1",
        slug: "cashmere-coat",
        name: "Cashmere Coat",
        description: "Editorial wrap coat.",
        composition: "100% Cashmere",
        care: "Dry clean only.",
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
            productId: "prod-new-1",
            size: "S",
            color: "Camel",
            colorHex: "#b68f66",
            sku: "JA-CASHMERECO-S-CAMEL",
            stockQty: 12,
            stock: 12,
            priceOverrideCents: null,
            discontinued: false,
          },
          {
            id: "v-2",
            productId: "prod-new-1",
            size: "M",
            color: "Camel",
            colorHex: "#b68f66",
            sku: "JA-CASHMERECO-M-CAMEL",
            stockQty: 8,
            stock: 8,
            priceOverrideCents: null,
            discontinued: false,
          },
        ],
        totalStock: 20,
      },
    });

    const req = new Request("http://localhost:3016/api/admin/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Cashmere Coat",
        categoryId: "cat-1",
        basePriceDollars: "495.00",
        description: "Editorial wrap coat.",
        composition: "100% Cashmere",
        care: "Dry clean only.",
        variants: [
          { size: "S", color: "Camel", stockQty: 12 },
          { size: "M", color: "Camel", stockQty: 8 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.product.id).toBe("prod-new-1");
    expect(data.product.status).toBe("draft");
    expect(data.product.variants).toHaveLength(2);
    expect(data.product.totalStock).toBe(20);
  });
});
