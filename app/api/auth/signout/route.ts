import { revokeAccountSession } from "@/db/auth.ts";
import { getDb } from "@/db/client.ts";
import {
  clearAccountSessionCookie,
  getAccountSessionToken,
} from "@/lib/auth/session-cookie.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(): Promise<Response> {
  try {
    const sessionToken = await getAccountSessionToken();
    if (sessionToken) {
      const db = getDb();
      await revokeAccountSession(db, sessionToken);
    }
  } catch (error) {
    console.error("Sign out error:", error);
  } finally {
    await clearAccountSessionCookie();
  }

  return Response.json({ ok: true }, { status: 200, headers: NO_STORE });
}
