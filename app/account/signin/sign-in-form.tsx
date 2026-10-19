"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/account";

  const [mode, setMode] = useState<"password" | "code">("password");

  // Password mode state
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");

  // Code mode state
  const [codeEmail, setCodeEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  // Status state
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: passwordEmail, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Invalid email or password.");
        return;
      }

      router.push(returnUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: codeEmail }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not send access code.");
        return;
      }

      setCodeSent(true);
      setInfo("An access code has been sent to your email address.");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: codeEmail, code }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Invalid or expired access code.");
        return;
      }

      router.push(returnUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-box" data-testid="signin-container">
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          className={`auth-tab ${mode === "password" ? "auth-tab--active" : ""}`}
          onClick={() => {
            setMode("password");
            setError(null);
            setInfo(null);
          }}
          data-testid="tab-password"
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          className={`auth-tab ${mode === "code" ? "auth-tab--active" : ""}`}
          onClick={() => {
            setMode("code");
            setError(null);
            setInfo(null);
          }}
          data-testid="tab-code"
        >
          Email Code
        </button>
      </div>

      {error && (
        <div className="auth-alert auth-alert--error" data-testid="signin-error" role="alert">
          {error}
        </div>
      )}

      {info && (
        <div className="auth-alert auth-alert--info" data-testid="signin-info" role="status">
          {info}
        </div>
      )}

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="auth-form" data-testid="password-form">
          <div className="auth-form__field">
            <label htmlFor="signin-email" className="auth-form__label">
              Email Address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={passwordEmail}
              onChange={(e) => setPasswordEmail(e.target.value)}
              className="auth-form__input"
              data-testid="signin-email-input"
              placeholder="you@example.com"
            />
          </div>

          <div className="auth-form__field">
            <label htmlFor="signin-password" className="auth-form__label">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-form__input"
              data-testid="signin-password-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-form__submit-btn"
            data-testid="signin-submit-btn"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>
      ) : (
        <div className="auth-form" data-testid="code-form">
          {!codeSent ? (
            <form onSubmit={handleSendCode}>
              <div className="auth-form__field">
                <label htmlFor="code-email" className="auth-form__label">
                  Email Address
                </label>
                <input
                  id="code-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={codeEmail}
                  onChange={(e) => setCodeEmail(e.target.value)}
                  className="auth-form__input"
                  data-testid="code-email-input"
                  placeholder="you@example.com"
                />
                <p className="auth-form__hint">
                  If you created your account without a password during checkout, we will send an access code to your email.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-form__submit-btn"
                data-testid="send-code-btn"
              >
                {loading ? "Sending Code..." : "Send Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <div className="auth-form__field">
                <label htmlFor="access-code" className="auth-form__label">
                  6-Digit Access Code
                </label>
                <input
                  id="access-code"
                  type="text"
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="auth-form__input auth-form__input--code"
                  data-testid="code-input"
                  placeholder="123456"
                  autoFocus
                />
                <p className="auth-form__hint">
                  Enter the 6-digit numeric code sent to {codeEmail}.
                </p>
              </div>

              <div className="auth-form__row-actions">
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-form__submit-btn"
                  data-testid="verify-code-btn"
                >
                  {loading ? "Verifying..." : "Sign In"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    setInfo(null);
                    setError(null);
                  }}
                  className="auth-form__text-btn"
                  data-testid="resend-code-btn"
                >
                  Change Email or Resend
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
