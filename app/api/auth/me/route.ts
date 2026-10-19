import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const sessionToken = await getAccountSessionToken();
    if (!sessionToken) {
      return Response.json({ authenticated: false }, { status: 200, headers: NO_STORE });
    }

    const db = getDb();
    const result = await getAccountFromSessionToken(db, sessionToken);

    if (!result) {
      return Response.json({ authenticated: false }, { status: 200, headers: NO_STORE });
    }

    return Response.json(
      {
        authenticated: true,
        account: {
          id: result.account.id,
          email: result.account.email,
        },
        roles: result.roles,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Auth check error:", error);
    return Response.json({ authenticated: false }, { status: 200, headers: NO_STORE });
  }
}
