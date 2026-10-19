import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import { SignOutButton } from "./sign-out-button.tsx";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account Overview — J. Armando",
};

export default async function AccountPage() {
  const sessionToken = await getAccountSessionToken();
  if (!sessionToken) {
    redirect("/account/signin");
  }

  let authData: Awaited<ReturnType<typeof getAccountFromSessionToken>> | null = null;
  try {
    const db = getDb();
    authData = await getAccountFromSessionToken(db, sessionToken);
  } catch (error) {
    console.error("Failed to load account data:", error);
  }

  if (!authData) {
    redirect("/account/signin");
  }

  const { account, roles } = authData;

  return (
    <main className="account-page" data-testid="account-page">
      <header className="account-page__header">
        <p className="account-page__eyebrow">Customer Account</p>
        <h1 className="account-page__title">Account Overview</h1>
      </header>

      <section className="account-card" data-testid="account-overview">
        <div className="account-card__field">
          <span className="account-card__label">Email Address</span>
          <span className="account-card__value" data-testid="account-email">
            {account.email}
          </span>
        </div>
        <div className="account-card__field">
          <span className="account-card__label">Roles</span>
          <span className="account-card__value" data-testid="account-roles">
            {roles.join(", ")}
          </span>
        </div>

        <div className="account-card__actions">
          <SignOutButton />
        </div>
      </section>

      <div className="account-page__links">
        <Link href="/catalog" className="account-page__link">
          Browse Collection
        </Link>
        <span className="account-page__link-separator">/</span>
        <Link href="/cart" className="account-page__link">
          View Cart
        </Link>
      </div>
    </main>
  );
}
