import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client.ts";
import { listAdminCategories } from "@/db/admin-products.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";
import { CreateProductForm } from "./create-product-form.tsx";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New Product — J. Armando Backoffice",
};

export default async function AdminNewProductPage() {
  const sessionResult = await getAdminSession();

  if (sessionResult.status === "unauthenticated") {
    redirect("/account/signin?returnUrl=/admin/products/new");
  }

  if (sessionResult.status === "forbidden") {
    return (
      <div className="admin-products-page" data-testid="admin-new-product-forbidden">
        <p>Access Denied: Admin role required.</p>
      </div>
    );
  }

  const db = getDb();
  const categories = await listAdminCategories(db);

  return (
    <div className="admin-products-page" data-testid="admin-new-product-page">
      <header className="admin-products-header">
        <div>
          <p className="admin-products-eyebrow">
            <Link href="/admin/products" className="admin-products-back-link">
              &larr; Back to Products
            </Link>
          </p>
          <h1 className="admin-products-title">Create New Product</h1>
          <p className="admin-products-subtitle">
            New garments are saved in draft state with per-variant inventory.
          </p>
        </div>
      </header>

      <CreateProductForm categories={categories} />
    </div>
  );
}
