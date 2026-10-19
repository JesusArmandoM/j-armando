"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
      });
      router.push("/account/signin");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="auth-btn auth-btn--secondary"
      data-testid="sign-out-btn"
    >
      {loading ? "Signing Out..." : "Sign Out"}
    </button>
  );
}
