import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client.ts";
import {
  createProductWithVariants,
  listAdminCategories,
  listAdminProducts,
} from "@/db/admin-products.ts";
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
    const [products, categories] = await Promise.all([
      listAdminProducts(db),
      listAdminCategories(db),
    ]);

    return Response.json(
      { ok: true, products, categories },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Admin products GET error:", error);
    return Response.json(
      { ok: false, error: "Unable to load products." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          ok: false,
          error: "Invalid JSON payload.",
          fieldErrors: { form: "Invalid JSON payload." },
        },
        { status: 400, headers: NO_STORE },
      );
    }

    const db = getDb();
    const result = await createProductWithVariants(db, body);

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
          fieldErrors: result.fieldErrors,
        },
        { status: 400, headers: NO_STORE },
      );
    }

    try {
      revalidatePath("/admin/products");
    } catch {
      // Ignore revalidation errors outside Next.js request context
    }

    return Response.json(
      { ok: true, product: result.product },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Admin products POST error:", error);
    return Response.json(
      { ok: false, error: "Unable to create product." },
      { status: 500, headers: NO_STORE },
    );
  }
}
