import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import { SignInForm } from "./sign-in-form.tsx";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign In — J. Armando",
};

interface SignInPageProps {
  searchParams?: Promise<{ returnUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnUrl = params.returnUrl || "/account";

  const sessionToken = await getAccountSessionToken();
  if (sessionToken) {
    try {
      const db = getDb();
      const auth = await getAccountFromSessionToken(db, sessionToken);
      if (auth) {
        redirect(returnUrl);
      }
    } catch {
      // Proceed to sign in form if DB or session check fails
    }
  }

  return (
    <main className="account-page" data-testid="signin-page">
      <header className="account-page__header">
        <p className="account-page__eyebrow">Customer Account</p>
        <h1 className="account-page__title">Sign In</h1>
        <p className="account-page__lede">
          Access your orders and account details.
        </p>
      </header>

      <Suspense fallback={<div className="auth-loading">Loading...</div>}>
        <SignInForm />
      </Suspense>

      <div className="account-page__links">
        <Link href="/catalog" className="account-page__link">
          Browse Collection
        </Link>
      </div>
    </main>
  );
}
