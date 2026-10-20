import type {
  ChatAnswer,
  ChatAnswerContext,
  ChatAssistant,
  ChatMessage,
} from "./chat-assistant.ts";
import { ChatAssistantError } from "./chat-assistant.ts";

export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiChatAssistantOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Native Google Gemini adapter for the {@link ChatAssistant} port.
 *
 * Calls Google's Generative Language API via standard fetch, avoiding heavy external SDKs.
 * Grounding facts and guardrail instructions are delivered in systemInstruction.
 */
export function createGeminiChatAssistant(
  options: GeminiChatAssistantOptions,
): ChatAssistant {
  const apiKey = options.apiKey.trim();
  const model = options.model?.trim() || DEFAULT_GEMINI_CHAT_MODEL;
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const fetchImpl = options.fetchFn ?? fetch;

  if (!apiKey) {
    throw new ChatAssistantError(
      "Gemini chat assistant requires an apiKey. Set GEMINI_API_KEY.",
      { kind: "configuration" },
    );
  }

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

      // Build system instruction from instructions and verified facts
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

      // Transform messages into Google Generative Language contents format
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

      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ChatAssistantError(
          `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "provider", cause: err },
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new ChatAssistantError(
          `Gemini API returned HTTP ${response.status}: ${errorText}`,
          { kind: "provider", status: response.status },
        );
      }

      interface GeminiCandidate {
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }
      interface GeminiResponse {
        candidates?: GeminiCandidate[];
      }

      let data: GeminiResponse;
      try {
        data = (await response.json()) as GeminiResponse;
      } catch (err) {
        throw new ChatAssistantError("Failed to parse Gemini JSON response.", {
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
