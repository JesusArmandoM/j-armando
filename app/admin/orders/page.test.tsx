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

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/admin-orders.ts", () => ({
  listAllOrdersForAdmin: vi.fn(),
}));

import { listAllOrdersForAdmin } from "@/db/admin-orders.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import AdminOrdersPage from "./page.tsx";

const getAdminSessionMock = vi.mocked(getAdminSession);
const listAllOrdersForAdminMock = vi.mocked(listAllOrdersForAdmin);

describe("AdminOrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated visitor to /account/signin?returnUrl=/admin/orders", async () => {
    getAdminSessionMock.mockResolvedValueOnce({ status: "unauthenticated" });

    await expect(AdminOrdersPage()).rejects.toThrow(
      "REDIRECT:/account/signin?returnUrl=/admin/orders",
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/account/signin?returnUrl=/admin/orders",
    );
  });

  it("renders forbidden message for non-admin customer", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "forbidden",
      account: {
        id: "cust-1",
        email: "customer@example.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
    });

    const page = await AdminOrdersPage();
    render(page);

    expect(screen.getByTestId("admin-forbidden")).toBeTruthy();
    expect(
      screen.getByText(
        "Access Denied: You do not have permission to view the backoffice.",
      ),
    ).toBeTruthy();
  });

  it("renders empty state when no orders exist", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });
    listAllOrdersForAdminMock.mockResolvedValueOnce([]);

    const page = await AdminOrdersPage();
    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "All Orders" }),
    ).toBeTruthy();
    expect(screen.getByTestId("admin-orders-empty")).toBeTruthy();
    expect(screen.getByText("No orders yet")).toBeTruthy();
  });

  it("renders orders from all customers with reference, customer email, statuses, items, and formatted USD total", async () => {
    getAdminSessionMock.mockResolvedValueOnce({
      status: "authorized",
      account: {
        id: "adm-1",
        email: "admin@j-armando.store",
        createdAt: new Date(),
      },
      roles: ["customer", "admin"],
    });

    listAllOrdersForAdminMock.mockResolvedValueOnce([
      {
        id: "ord-2",
        reference: "JA-888888",
        accountId: "cust-2",
        contactEmail: "bob.shopper@example.com",
        status: "paid",
        fulfillmentStatus: "unfulfilled",
        subtotalCents: 34900,
        shippingCents: 1500,
        taxCents: 2792,
        totalCents: 39192,
        currency: "USD",
        createdAt: new Date("2026-10-19T16:30:00Z"),
        paidAt: new Date("2026-10-19T16:30:00Z"),
        itemCount: 1,
        lineCount: 1,
      },
      {
        id: "ord-1",
        reference: "JA-777777",
        accountId: "cust-1",
        contactEmail: "alice.customer@example.com",
        status: "paid",
        fulfillmentStatus: "unfulfilled",
        subtotalCents: 24900,
        shippingCents: 0,
        taxCents: 1992,
        totalCents: 26892,
        currency: "USD",
        createdAt: new Date("2026-10-19T14:00:00Z"),
        paidAt: new Date("2026-10-19T14:00:00Z"),
        itemCount: 3,
        lineCount: 2,
      },
    ]);

    const page = await AdminOrdersPage();
    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "All Orders" }),
    ).toBeTruthy();
    expect(screen.getByTestId("admin-orders-count").textContent).toContain(
      "Showing 2 orders across all customers.",
    );

    const rows = screen.getAllByTestId("admin-order-row");
    expect(rows).toHaveLength(2);

    const references = screen.getAllByTestId("admin-order-reference");
    expect(references[0].textContent).toBe("JA-888888");
    expect(references[0].getAttribute("href")).toBe("/admin/orders/JA-888888");
    expect(references[1].textContent).toBe("JA-777777");
    expect(references[1].getAttribute("href")).toBe("/admin/orders/JA-777777");

    const emails = screen.getAllByTestId("admin-order-email");
    expect(emails[0].textContent).toBe("bob.shopper@example.com");
    expect(emails[1].textContent).toBe("alice.customer@example.com");

    const items = screen.getAllByTestId("admin-order-items");
    expect(items[0].textContent).toBe("1 item");
    expect(items[1].textContent).toBe("3 items");

    const statuses = screen.getAllByTestId("admin-order-status");
    expect(statuses[0].textContent).toBe("Paid");
    expect(statuses[1].textContent).toBe("Paid");

    const fulfillments = screen.getAllByTestId("admin-order-fulfillment");
    expect(fulfillments[0].textContent).toBe("Unfulfilled");
    expect(fulfillments[1].textContent).toBe("Unfulfilled");

    const totals = screen.getAllByTestId("admin-order-total");
    expect(totals[0].textContent).toBe("$391.92");
    expect(totals[1].textContent).toBe("$268.92");
  });
});
