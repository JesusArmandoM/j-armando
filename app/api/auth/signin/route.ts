import { authenticateWithPassword, createAccountSession } from "@/db/auth.ts";
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
      { ok: false, error: "Invalid email or password." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return Response.json(
      { ok: false, error: "Invalid email or password." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const db = getDb();
    const result = await authenticateWithPassword(db, email, password);

    if (!result.ok) {
      return Response.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401, headers: NO_STORE },
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
    console.error("Authentication error:", error);
    return Response.json(
      { ok: false, error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
