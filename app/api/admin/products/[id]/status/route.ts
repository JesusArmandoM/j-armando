import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client.ts";
import {
  isValidProductStatus,
  updateProductStatus,
} from "@/db/admin-products.ts";
import { getAdminSession } from "@/lib/auth/admin-guard.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

async function handleStatusUpdate(
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
    const id = params?.id;

    if (!id || typeof id !== "string") {
      return Response.json(
        { ok: false, error: "Product ID is required." },
        { status: 400, headers: NO_STORE },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          ok: false,
          error: "Invalid JSON payload.",
        },
        { status: 400, headers: NO_STORE },
      );
    }

    const newStatus = (body as { status?: unknown })?.status;
    if (!isValidProductStatus(newStatus)) {
      return Response.json(
        {
          ok: false,
          error:
            "Invalid status. Allowed values are 'draft', 'published', or 'archived'.",
        },
        { status: 400, headers: NO_STORE },
      );
    }

    const db = getDb();
    const updatedProduct = await updateProductStatus(db, id, newStatus);

    if (!updatedProduct) {
      return Response.json(
        { ok: false, error: "Product not found." },
        { status: 404, headers: NO_STORE },
      );
    }

    try {
      revalidatePath("/admin/products");
      revalidatePath(`/admin/products/${id}`);
      revalidatePath("/catalog");
      revalidatePath(`/products/${updatedProduct.slug}`);
    } catch {
      // Revalidation might be skipped outside Next.js request context
    }

    return Response.json(
      { ok: true, product: updatedProduct },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Admin product status update error:", error);
    return Response.json(
      { ok: false, error: "Unable to update product status." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleStatusUpdate(request, context);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleStatusUpdate(request, context);
}
