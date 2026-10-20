import { updateOrderFulfillmentStatus } from "@/db/admin-orders.ts";
import { getDb } from "@/db/client.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

interface RouteContext {
  params: Promise<{ reference: string }> | { reference: string };
}

async function handleFulfillmentUpdate(
  request: Request,
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

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.fulfillmentStatus !== "string" ||
      !body.fulfillmentStatus.trim()
    ) {
      return Response.json(
        {
          ok: false,
          error: "Missing or invalid 'fulfillmentStatus' in request body.",
        },
        { status: 400, headers: NO_STORE },
      );
    }

    const db = getDb();
    const result = await updateOrderFulfillmentStatus(
      db,
      reference,
      body.fulfillmentStatus.trim(),
    );

    if (!result.ok) {
      if (result.error === "not_found") {
        return Response.json(
          { ok: false, error: result.message },
          { status: 404, headers: NO_STORE },
        );
      }
      return Response.json(
        {
          ok: false,
          error: result.message,
          ...(result.error === "invalid_transition"
            ? {
                currentStatus: result.currentStatus,
                requestedStatus: result.requestedStatus,
              }
            : {}),
        },
        { status: 400, headers: NO_STORE },
      );
    }

    return Response.json(
      { ok: true, order: result.order },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to update order fulfillment status:", error);
    return Response.json(
      { ok: false, error: "Internal server error." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleFulfillmentUpdate(request, context);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleFulfillmentUpdate(request, context);
}
