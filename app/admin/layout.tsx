import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/auth/admin-guard.ts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Backoffice — J. Armando",
};

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect("/account/signin?returnUrl=/admin");
  }

  if (sessionResult.status === "forbidden") {
    return (
      <main className="admin-forbidden" data-testid="admin-forbidden">
        <div className="admin-forbidden__card">
          <p className="admin-forbidden__eyebrow">403 Forbidden</p>
          <h1 className="admin-forbidden__title">Access Denied</h1>
          <p className="admin-forbidden__message">
            Access Denied: You do not have permission to view the backoffice.
          </p>
          <div className="admin-forbidden__account-info">
            <span className="admin-forbidden__label">Signed in as:</span>
            <span className="admin-forbidden__email" data-testid="forbidden-email">
              {sessionResult.account.email}
            </span>
            <span className="admin-forbidden__role-note">
              (Roles: {sessionResult.roles.join(", ")})
            </span>
          </div>
          <div className="admin-forbidden__actions">
            <Link href="/" className="admin-btn admin-btn--primary">
              Return to Store
            </Link>
            <Link href="/account" className="admin-btn admin-btn--secondary">
              Customer Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { account } = sessionResult;

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <header className="admin-header">
        <div className="admin-header__brand">
          <Link href="/admin" className="admin-header__title">
            J. Armando Backoffice
          </Link>
          <span className="admin-header__badge" data-testid="admin-badge">
            Admin
          </span>
        </div>

        <nav className="admin-nav" aria-label="Backoffice navigation">
          <Link href="/admin" className="admin-nav__link">
            Dashboard
          </Link>
          <Link href="/admin/products" className="admin-nav__link">
            Products
          </Link>
          <Link href="/admin/orders" className="admin-nav__link">
            Orders
          </Link>
        </nav>

        <div className="admin-header__meta">
          <span className="admin-header__user" data-testid="admin-email">
            {account.email}
          </span>
          <span className="admin-header__separator">/</span>
          <Link href="/" className="admin-header__store-link">
            Storefront
          </Link>
        </div>
      </header>

      <main className="admin-content">{children}</main>
    </div>
  );
}
