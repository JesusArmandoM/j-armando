import { requestPasswordlessAccessCode } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  return /^application\/json(\s*;.*)?$/i.test(contentType);
}

export async function POST(request: Request): Promise<Response> {
  if (!isJsonContentType(request)) {
    return Response.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400, headers: NO_STORE },
    );
  }

  if (typeof body !== "object" || body === null) {
    return Response.json(
      { ok: false, error: "Email is required." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { email } = body as Record<string, unknown>;

  if (typeof email !== "string" || !email.trim()) {
    return Response.json(
      { ok: false, error: "Email is required." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const db = getDb();
    const result = await requestPasswordlessAccessCode(db, email.trim());

    if (!result.ok) {
      if (result.error === "account_not_found") {
        return Response.json(
          { ok: false, error: "No account found with this email." },
          { status: 404, headers: NO_STORE },
        );
      }
      return Response.json(
        { ok: false, error: "Could not send access code." },
        { status: 400, headers: NO_STORE },
      );
    }

    return Response.json({ ok: true }, { status: 200, headers: NO_STORE });
  } catch (error) {
    console.error("Access code request error:", error);
    return Response.json(
      { ok: false, error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
