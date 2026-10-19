import { getOrderForAdmin } from "@/db/admin-orders.ts";
import { getDb } from "@/db/client.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";

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

    const params = await Promise.resolve(context.params);
    const reference = params?.reference;

    if (!reference) {
      return Response.json(
        { ok: false, error: "Order not found." },
        { status: 404, headers: NO_STORE },
      );
    }

    const db = getDb();
    const order = await getOrderForAdmin(db, reference);

    if (!order) {
      return Response.json(
        { ok: false, error: "Order not found." },
        { status: 404, headers: NO_STORE },
      );
    }

    return Response.json(
      { ok: true, order },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to get admin order:", error);
    return Response.json(
      { ok: false, error: "Internal server error." },
      { status: 500, headers: NO_STORE },
    );
  }
}
