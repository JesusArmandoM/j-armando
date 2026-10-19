import { ChatAssistantError } from "@/lib/chat/chat-assistant.ts";
import type { ChatMessage } from "@/lib/chat/chat-assistant.ts";
import { answerChat } from "./composition.ts";

// The only server seam the chat UI knows. The panel POSTs `{ messages }` here
// and gets `{ reply }` back; it never learns which provider is configured.
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["user", "assistant"]);

/** Validates the request body; returns the messages or `null` when malformed. */
function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const parsed: ChatMessage[] = [];
  for (const entry of messages) {
    if (typeof entry !== "object" || entry === null) return null;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || !VALID_ROLES.has(role)) return null;
    if (typeof content !== "string" || content.trim() === "") return null;
    parsed.push({ role: role as ChatMessage["role"], content });
  }
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const messages = parseMessages(body);
  if (!messages) {
    return Response.json(
      {
        error:
          "Request body must be `{ messages: [{ role: 'user' | 'assistant', content: string }] }` with at least one non-empty message.",
      },
      { status: 400 },
    );
  }

  try {
    const answer = await answerChat(messages);
    return Response.json({ reply: answer.content });
  } catch (error) {
    if (error instanceof ChatAssistantError) {
      const status = error.kind === "configuration" ? 503 : 502;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json(
      { error: "The chat assistant is temporarily unavailable." },
      { status: 502 },
    );
  }
}
