import { listAllOrdersForAdmin } from "@/db/admin-orders.ts";
import { getDb } from "@/db/client.ts";
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

    const db = getDb();
    const orders = await listAllOrdersForAdmin(db);

    return Response.json(
      { ok: true, orders },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to list admin orders:", error);
    return Response.json(
      { ok: false, error: "Internal server error." },
      { status: 500, headers: NO_STORE },
    );
  }
}
