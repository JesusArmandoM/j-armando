import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`REDIRECT:${url}`);
  },
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

import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";
import AccountPage from "./page.tsx";
import { SignOutButton } from "./sign-out-button.tsx";

const getAccountSessionTokenMock = vi.mocked(getAccountSessionToken);
const getAccountFromSessionTokenMock = vi.mocked(getAccountFromSessionToken);

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated visitor to /account/signin", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce(undefined);

    await expect(AccountPage()).rejects.toThrow("REDIRECT:/account/signin");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin");
  });

  it("redirects when session is invalid or expired", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("invalid_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce(null);

    await expect(AccountPage()).rejects.toThrow("REDIRECT:/account/signin");
    expect(redirectMock).toHaveBeenCalledWith("/account/signin");
  });

  it("renders Account Overview with email, roles and sign-out button when authenticated", async () => {
    getAccountSessionTokenMock.mockResolvedValueOnce("valid_session_token");
    getAccountFromSessionTokenMock.mockResolvedValueOnce({
      account: {
        id: "acc-user-1",
        email: "customer@j-armando.com",
        createdAt: new Date(),
      },
      roles: ["customer"],
      session: {
        id: "sess-1",
        accountId: "acc-user-1",
        sessionToken: "valid_session_token",
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
      },
    });

    const page = await AccountPage();
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Account Overview" })).toBeTruthy();
    expect(screen.getByTestId("account-email").textContent).toBe("customer@j-armando.com");
    expect(screen.getByTestId("account-roles").textContent).toBe("customer");
    expect(screen.getByTestId("sign-out-btn")).toBeTruthy();
  });
});

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("calls POST /api/auth/signout and navigates to /account/signin on click", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<SignOutButton />);

    const btn = screen.getByTestId("sign-out-btn");
    expect(btn.textContent).toBe("Sign Out");

    fireEvent.click(btn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
      });
      expect(pushMock).toHaveBeenCalledWith("/account/signin");
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
