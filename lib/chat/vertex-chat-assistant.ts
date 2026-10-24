import type {
  ChatAnswer,
  ChatAnswerContext,
  ChatAssistant,
  ChatMessage,
} from "./chat-assistant.ts";
import { ChatAssistantError } from "./chat-assistant.ts";
import { getGoogleCloudAccessToken, getServiceAccountCredentials } from "../ai/google-auth.ts";

export const DEFAULT_VERTEX_CHAT_MODEL = "gemini-2.5-flash";
export const DEFAULT_VERTEX_LOCATION = "us-central1";

export interface VertexChatAssistantOptions {
  model?: string;
  location?: string;
  projectId?: string;
  fetchFn?: typeof fetch;
}

export function createVertexChatAssistant(
  options: VertexChatAssistantOptions = {},
): ChatAssistant {
  const model = options.model?.trim() || DEFAULT_VERTEX_CHAT_MODEL;
  const location = options.location?.trim() || DEFAULT_VERTEX_LOCATION;
  const fetchImpl = options.fetchFn ?? fetch;

  return {
    async answer(
      messages: ChatMessage[],
      context?: ChatAnswerContext,
    ): Promise<ChatAnswer> {
      if (!messages || messages.length === 0) {
        throw new ChatAssistantError(
          "Cannot generate answer: messages array is empty.",
          { kind: "provider" },
        );
      }

      let credentials;
      let token: string;
      try {
        credentials = getServiceAccountCredentials();
        token = await getGoogleCloudAccessToken();
      } catch (err) {
        throw new ChatAssistantError(
          `Google Cloud Vertex AI auth failed: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "configuration", cause: err },
        );
      }

      const projectId = options.projectId || credentials.project_id;

      // Build system instruction
      const systemParts: string[] = [];
      if (context?.instructions) {
        systemParts.push(context.instructions);
      }
      if (context?.verifiedFacts && context.verifiedFacts.length > 0) {
        systemParts.push(
          "Verified store facts:\n" +
            context.verifiedFacts.map((f) => `- ${f}`).join("\n"),
        );
      }

      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const body: Record<string, unknown> = { contents };
      if (systemParts.length > 0) {
        body.systemInstruction = {
          parts: [{ text: systemParts.join("\n\n") }],
        };
      }

      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
        projectId,
      )}/locations/${location}/publishers/google/models/${encodeURIComponent(
        model,
      )}:generateContent`;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ChatAssistantError(
          `Vertex AI request failed: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "provider", cause: err },
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ChatAssistantError(
          `Vertex AI returned HTTP ${response.status}: ${errorText}`,
          { kind: "provider", status: response.status },
        );
      }

      interface VertexCandidate {
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }
      interface VertexResponse {
        candidates?: VertexCandidate[];
      }

      let data: VertexResponse;
      try {
        data = (await response.json()) as VertexResponse;
      } catch (err) {
        throw new ChatAssistantError("Failed to parse Vertex AI JSON response.", {
          kind: "provider",
          cause: err,
        });
      }

      const replyText =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("")
          .trim() ?? "";

      return { content: replyText };
    },
  };
}
