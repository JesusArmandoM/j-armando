import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard.ts", () => ({
  getAdminSession: vi.fn(),
}));

import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import AdminDashboardPage from "./page.tsx";

const getAdminSessionMock = vi.mocked(getAdminSession);

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dashboard title, personalized welcome, and management cards", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "founder@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["admin"],
    });

    const jsx = await AdminDashboardPage();
    render(jsx);

    expect(screen.getByTestId("admin-dashboard")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Backoffice Dashboard" })).toBeDefined();
    expect(screen.getByTestId("admin-welcome").textContent).toContain("founder@j-armando.store");
    expect(screen.getByTestId("admin-card-catalog")).toBeDefined();
    expect(screen.getByTestId("admin-card-orders")).toBeDefined();
    expect(screen.getByRole("link", { name: /Manage Products/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /View Orders/i })).toBeDefined();
  });
});
