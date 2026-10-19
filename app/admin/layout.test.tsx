import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import AdminLayout from "./layout.tsx";

const getAdminSessionMock = vi.mocked(getAdminSession);

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Scenario 3: redirects unauthenticated visitor to /account/signin?returnUrl=/admin", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    await expect(AdminLayout({ children: <div>Child Content</div> })).rejects.toThrow(
      "REDIRECT:/account/signin?returnUrl=/admin",
    );
    expect(redirectMock).toHaveBeenCalledWith("/account/signin?returnUrl=/admin");
  });

  it("Scenario 2: renders 403 Forbidden page for authenticated customer lacking admin role", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: {
        id: "cust-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    const jsx = await AdminLayout({ children: <div>Child Content</div> });
    render(jsx);

    const forbiddenEl = screen.getByTestId("admin-forbidden");
    expect(forbiddenEl).toBeDefined();
    expect(
      screen.getByText("Access Denied: You do not have permission to view the backoffice."),
    ).toBeDefined();
    expect(screen.getByTestId("forbidden-email").textContent).toBe("customer@example.com");
    expect(screen.getByRole("link", { name: "Return to Store" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Customer Account" })).toBeDefined();
    expect(screen.queryByText("Child Content")).toBeNull();
  });

  it("Scenario 1: renders Backoffice shell and children for authorized admin", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    const jsx = await AdminLayout({ children: <div>Child Content</div> });
    render(jsx);

    expect(screen.getByTestId("admin-shell")).toBeDefined();
    expect(screen.getByText("J. Armando Backoffice")).toBeDefined();
    expect(screen.getByTestId("admin-badge").textContent).toBe("Admin");
    expect(screen.getByTestId("admin-email").textContent).toBe("admin@j-armando.store");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Products" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Orders" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Storefront" })).toBeDefined();
    expect(screen.getByText("Child Content")).toBeDefined();
  });
});
