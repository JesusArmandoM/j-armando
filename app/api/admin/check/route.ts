import { getAdminSession } from "@/lib/auth/admin-guard.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const sessionResult = await getAdminSession();

    if (sessionResult.status === "unauthenticated") {
      return Response.json(
        { ok: false, error: "Authentication required." },
        { status: 401, headers: NO_STORE },
      );
    }

    if (sessionResult.status === "forbidden") {
      return Response.json(
        { ok: false, error: "Access denied. Admin role required." },
        { status: 403, headers: NO_STORE },
      );
    }

    return Response.json(
      {
        ok: true,
        admin: true,
        account: {
          id: sessionResult.account.id,
          email: sessionResult.account.email,
        },
        roles: sessionResult.roles,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Admin check API error:", error);
    return Response.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers: NO_STORE },
    );
  }
}
