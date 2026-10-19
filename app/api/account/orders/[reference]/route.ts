import { getAccountFromSessionToken } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { getOrderByReferenceForAccount } from "@/db/order.ts";
import { getAccountSessionToken } from "@/lib/auth/session-cookie.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

interface RouteContext {
  params: Promise<{ reference: string }> | { reference: string };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
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

    const params = await Promise.resolve(context.params);
    const reference = params?.reference;

    if (!reference) {
      return Response.json(
        { ok: false, error: "Order not found" },
        { status: 404, headers: NO_STORE },
      );
    }

    const order = await getOrderByReferenceForAccount(
      db,
      reference,
      authData.account.id,
    );

    if (!order) {
      return Response.json(
        { ok: false, error: "Order not found" },
        { status: 404, headers: NO_STORE },
      );
    }

    return Response.json(
      {
        ok: true,
        order,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to get account order:", error);
    return Response.json(
      { ok: false, error: "Internal server error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
