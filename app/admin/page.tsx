import Link from "next/link";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — J. Armando Backoffice",
};

export default async function AdminDashboardPage() {
  const sessionResult = await getAdminSession();
  const email = sessionResult.status === "authorized" ? sessionResult.account.email : "Admin";

  return (
    <div className="admin-dashboard" data-testid="admin-dashboard">
      <header className="admin-dashboard__header">
        <p className="admin-dashboard__eyebrow">Backoffice</p>
        <h1 className="admin-dashboard__title">Backoffice Dashboard</h1>
        <p className="admin-dashboard__welcome" data-testid="admin-welcome">
          Welcome back, {email}. Manage your catalog, inventory, and order fulfillment.
        </p>
      </header>

      <div className="admin-dashboard__grid">
        <section className="admin-card" data-testid="admin-card-catalog">
          <p className="admin-card__eyebrow">Inventory & Garments</p>
          <h2 className="admin-card__title">Catalog Management</h2>
          <p className="admin-card__description">
            Create, publish, and manage product listings, size options, and stock quantities across
            the collection.
          </p>
          <div className="admin-card__actions">
            <Link href="/admin/products" className="admin-card__link">
              Manage Products &rarr;
            </Link>
          </div>
        </section>

        <section className="admin-card" data-testid="admin-card-orders">
          <p className="admin-card__eyebrow">Operations & Shipping</p>
          <h2 className="admin-card__title">Order Fulfillment</h2>
          <p className="admin-card__description">
            Review customer orders, track shipping status, and update order fulfillment stages.
          </p>
          <div className="admin-card__actions">
            <Link href="/admin/orders" className="admin-card__link">
              View Orders &rarr;
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
