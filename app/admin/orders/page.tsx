import Link from "next/link";
import { redirect } from "next/navigation";

import { listAllOrdersForAdmin } from "@/db/admin-orders.ts";
import type { AdminOrderSummary } from "@/db/admin-orders.ts";
import { getDb } from "@/db/client.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { formatPriceUSD } from "@/lib/money.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders — J. Armando Backoffice",
};

function formatOrderDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatStatusLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export default async function AdminOrdersPage() {
  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect("/account/signin?returnUrl=/admin/orders");
  }

  if (sessionResult.status === "forbidden") {
    return (
      <div className="admin-orders-forbidden" data-testid="admin-forbidden">
        <p>Access Denied: You do not have permission to view the backoffice.</p>
      </div>
    );
  }

  let orders: AdminOrderSummary[] = [];
  try {
    const db = getDb();
    orders = await listAllOrdersForAdmin(db);
  } catch (error) {
    console.error("Failed to load orders for admin:", error);
  }

  return (
    <div className="admin-orders-page" data-testid="admin-orders-page">
      <header className="admin-orders-header">
        <div className="admin-orders-header__titles">
          <p className="admin-orders-header__eyebrow">Operations &amp; Shipping</p>
          <h1 className="admin-orders-header__title">All Orders</h1>
          <p className="admin-orders-header__subtitle" data-testid="admin-orders-count">
            Showing {orders.length} {orders.length === 1 ? "order" : "orders"} across all
            customers.
          </p>
        </div>
      </header>

      {orders.length === 0 ? (
        <section className="admin-orders-empty" data-testid="admin-orders-empty">
          <h2 className="admin-orders-empty__title">No orders yet</h2>
          <p className="admin-orders-empty__message">
            No customer orders have been placed yet. Completed purchases will appear here.
          </p>
        </section>
      ) : (
        <div className="admin-orders-table-wrap">
          <table className="admin-orders-table" data-testid="admin-orders-table">
            <thead>
              <tr>
                <th scope="col">Order Reference</th>
                <th scope="col">Date</th>
                <th scope="col">Customer Email</th>
                <th scope="col">Items</th>
                <th scope="col">Payment Status</th>
                <th scope="col">Fulfillment Status</th>
                <th scope="col" className="admin-orders-table__num">
                  Total (USD)
                </th>
                <th scope="col" className="admin-orders-table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => {
                const fulfillmentRaw = item.fulfillmentStatus ?? "unfulfilled";
                return (
                  <tr
                    key={item.id}
                    className="admin-orders-row"
                    data-testid="admin-order-row"
                  >
                    <td className="admin-orders-cell admin-orders-cell--ref">
                      <Link
                        href={`/admin/orders/${item.reference}`}
                        className="admin-orders-ref-link"
                        data-testid="admin-order-reference"
                      >
                        {item.reference}
                      </Link>
                    </td>
                    <td className="admin-orders-cell">
                      <time
                        className="admin-orders-date"
                        data-testid="admin-order-date"
                      >
                        {formatOrderDate(item.createdAt)}
                      </time>
                    </td>
                    <td
                      className="admin-orders-cell admin-orders-cell--email"
                      data-testid="admin-order-email"
                    >
                      {item.contactEmail}
                    </td>
                    <td
                      className="admin-orders-cell"
                      data-testid="admin-order-items"
                    >
                      {item.itemCount} {item.itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="admin-orders-cell">
                      <span
                        className={`admin-orders-badge admin-orders-badge--status admin-orders-badge--${item.status}`}
                        data-testid="admin-order-status"
                      >
                        {formatStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="admin-orders-cell">
                      <span
                        className={`admin-orders-badge admin-orders-badge--fulfillment admin-orders-badge--${fulfillmentRaw}`}
                        data-testid="admin-order-fulfillment"
                      >
                        {formatStatusLabel(fulfillmentRaw)}
                      </span>
                    </td>
                    <td className="admin-orders-cell admin-orders-cell--total">
                      <strong
                        className="admin-orders-total"
                        data-testid="admin-order-total"
                      >
                        {formatPriceUSD(item.totalCents)}
                      </strong>
                    </td>
                    <td className="admin-orders-cell admin-orders-cell--actions">
                      <Link
                        href={`/admin/orders/${item.reference}`}
                        className="admin-orders-detail-link"
                        data-testid="admin-order-detail-link"
                      >
                        View Details &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
