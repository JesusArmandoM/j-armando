import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === "returnUrl" ? "/account" : null),
  }),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session-cookie.ts", () => ({
  getAccountSessionToken: vi.fn(),
}));

vi.mock("@/db/auth.ts", () => ({
  getAccountFromSessionToken: vi.fn(),
}));

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

import SignInPage from "./page.tsx";
import { SignInForm } from "./sign-in-form.tsx";

describe("SignInForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders both Password and Email Code tabs, defaulting to Password", () => {
    render(<SignInForm />);

    expect(screen.getByTestId("tab-password")).toBeTruthy();
    expect(screen.getByTestId("tab-code")).toBeTruthy();
    expect(screen.getByTestId("password-form")).toBeTruthy();
    expect(screen.queryByTestId("code-form")).toBeNull();
  });

  it("submits password credentials and redirects on success", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, account: { id: "1", email: "user@example.com" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<SignInForm />);

    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByTestId("signin-password-input"), {
      target: { value: "SecretPass123" },
    });
    fireEvent.click(screen.getByTestId("signin-submit-btn"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signin",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "user@example.com", password: "SecretPass123" }),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/account");
    });
  });

  it("displays error banner on password authentication failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Invalid email or password." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<SignInForm />);

    fireEvent.change(screen.getByTestId("signin-email-input"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByTestId("signin-password-input"), {
      target: { value: "WrongPass" },
    });
    fireEvent.click(screen.getByTestId("signin-submit-btn"));

    await waitFor(() => {
      const errorEl = screen.getByTestId("signin-error");
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toBe("Invalid email or password.");
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  it("handles passwordless OTP email code flow", async () => {
    // 1. Switch tab to Email Code
    render(<SignInForm />);
    fireEvent.click(screen.getByTestId("tab-code"));

    expect(screen.getByTestId("code-form")).toBeTruthy();
    expect(screen.getByTestId("code-email-input")).toBeTruthy();

    // 2. Request code
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    fireEvent.change(screen.getByTestId("code-email-input"), {
      target: { value: "shopper@example.com" },
    });
    fireEvent.click(screen.getByTestId("send-code-btn"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/request-code",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "shopper@example.com" }),
        }),
      );
      expect(screen.getByTestId("code-input")).toBeTruthy();
      expect(screen.getByTestId("verify-code-btn")).toBeTruthy();
    });

    // 3. Verify code
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, account: { id: "2", email: "shopper@example.com" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    fireEvent.change(screen.getByTestId("code-input"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByTestId("verify-code-btn"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/verify-code",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "shopper@example.com", code: "654321" }),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/account");
    });
  });

  it("displays error on invalid access code", async () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByTestId("tab-code"));

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    fireEvent.change(screen.getByTestId("code-email-input"), {
      target: { value: "shopper@example.com" },
    });
    fireEvent.click(screen.getByTestId("send-code-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("code-input")).toBeTruthy();
    });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: "Invalid or expired access code." }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    fireEvent.change(screen.getByTestId("code-input"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByTestId("verify-code-btn"));

    await waitFor(() => {
      const errorEl = screen.getByTestId("signin-error");
      expect(errorEl.textContent).toBe("Invalid or expired access code.");
      expect(pushMock).not.toHaveBeenCalled();
    });
  });
});

describe("SignInPage Component", () => {
  it("renders page header and navigation link", async () => {
    const page = await SignInPage({});
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Sign In" })).toBeTruthy();
    expect(screen.getByText("Access your orders and account details.")).toBeTruthy();
    expect(screen.getByText("Browse Collection")).toBeTruthy();
  });
});
