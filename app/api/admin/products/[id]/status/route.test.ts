// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-products.ts", () => ({
  isValidProductStatus: vi.fn(
    (status: unknown) =>
      status === "draft" || status === "published" || status === "archived",
  ),
  updateProductStatus: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { updateProductStatus } from "@/db/admin-products.ts";
import { PATCH, POST } from "./route.ts";

const getAdminSessionMock = vi.mocked(getAdminSession);
const updateProductStatusMock = vi.mocked(updateProductStatus);

const mockAdminSession = {
  status: "authorized" as const,
  account: {
    id: "adm-1",
    email: "admin@j-armando.store",
    createdAt: new Date(),
  },
  roles: ["customer", "admin"],
};

describe("PATCH and POST /api/admin/products/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated and 403 when lacking admin role", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });
    const req1 = new Request("http://localhost:3018/api/admin/products/p-1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    const res401 = await PATCH(req1, { params: Promise.resolve({ id: "p-1" }) });
    expect(res401.status).toBe(401);
    expect(res401.headers.get("cache-control")).toBe("no-store");

    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: { id: "cust-1", email: "user@example.com", createdAt: new Date() },
      roles: ["customer"],
    });
    const req2 = new Request("http://localhost:3018/api/admin/products/p-1/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    const res403 = await POST(req2, { params: { id: "p-1" } });
    expect(res403.status).toBe(403);
    expect(res403.headers.get("cache-control")).toBe("no-store");
    expect(updateProductStatusMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is invalid JSON or has invalid status", async () => {
    getAdminSessionMock.mockResolvedValue(mockAdminSession);

    // Invalid JSON
    const badJsonReq = new Request(
      "http://localhost:3018/api/admin/products/p-1/status",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "invalid-json",
      },
    );
    const resBadJson = await PATCH(badJsonReq, {
      params: Promise.resolve({ id: "p-1" }),
    });
    expect(resBadJson.status).toBe(400);
    const dataBadJson = await resBadJson.json();
    expect(dataBadJson.ok).toBe(false);

    // Invalid status string
    const badStatusReq = new Request(
      "http://localhost:3018/api/admin/products/p-1/status",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "deleted" }),
      },
    );
    const resBadStatus = await PATCH(badStatusReq, {
      params: Promise.resolve({ id: "p-1" }),
    });
    expect(resBadStatus.status).toBe(400);
    const dataBadStatus = await resBadStatus.json();
    expect(dataBadStatus.ok).toBe(false);
    expect(dataBadStatus.error).toContain("Allowed values are 'draft', 'published', or 'archived'");
  });

  it("returns 404 when product is not found", async () => {
    getAdminSessionMock.mockResolvedValueOnce(mockAdminSession);
    updateProductStatusMock.mockResolvedValueOnce(null);

    const req = new Request(
      "http://localhost:3018/api/admin/products/00000000-0000-0000-0000-000000000000/status",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Product not found.");
  });

  it("returns 200 with updated product on successful status change", async () => {
    getAdminSessionMock.mockResolvedValueOnce(mockAdminSession);
    const mockUpdatedProduct = {
      id: "prod-1",
      slug: "tailored-blazer",
      name: "Tailored Blazer",
      description: "Description",
      composition: "Wool",
      care: "Dry clean",
      status: "published" as const,
      basePriceCents: 28900,
      currency: "USD",
      categoryId: "cat-1",
      categoryName: "Blazers",
      categorySlug: "blazers",
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [],
      variants: [],
      totalStock: 10,
    };
    updateProductStatusMock.mockResolvedValueOnce(mockUpdatedProduct);

    const req = new Request("http://localhost:3018/api/admin/products/prod-1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prod-1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.product.status).toBe("published");
    expect(updateProductStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      "prod-1",
      "published",
    );
  });
});
