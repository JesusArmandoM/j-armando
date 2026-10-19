import { createAccountSession, verifyPasswordlessAccessCode } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import { setAccountSessionCookie } from "@/lib/auth/session-cookie.ts";

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
      { ok: false, error: "Email and access code are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { email, code } = body as Record<string, unknown>;

  if (
    typeof email !== "string" ||
    typeof code !== "string" ||
    !email.trim() ||
    !code.trim()
  ) {
    return Response.json(
      { ok: false, error: "Email and access code are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const db = getDb();
    const result = await verifyPasswordlessAccessCode(db, email, code);

    if (!result.ok) {
      return Response.json(
        { ok: false, error: "Invalid or expired access code." },
        { status: 400, headers: NO_STORE },
      );
    }

    const session = await createAccountSession(db, result.account.id);
    await setAccountSessionCookie(session.sessionToken);

    return Response.json(
      {
        ok: true,
        account: {
          id: result.account.id,
          email: result.account.email,
        },
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("Access code verification error:", error);
    return Response.json(
      { ok: false, error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
