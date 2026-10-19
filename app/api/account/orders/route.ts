import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { listOrdersForAccount } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const sessionToken = await getAccountSessionToken();
    if (!sessionToken) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    const db = getDb();
    const authData = await getAccountFromSessionToken(db, sessionToken);
    if (!authData) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    const orders = await listOrdersForAccount(db, authData.account.id);

    return Response.json(
      {
        ok: true,
        orders,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to list account orders:", error);
    return Response.json(
      { ok: false, error: "Internal server error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
