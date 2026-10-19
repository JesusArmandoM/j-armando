import {
  CHAT_SYSTEM_PROMPT,
  ChatAssistantError,
} from "./chat-assistant.ts";
import type {
  ChatAnswer,
  ChatAnswerContext,
  ChatAssistant,
  ChatMessage,
} from "./chat-assistant.ts";

// OpenAI Chat Completions adapter. This is the real provider integration behind
// the ChatAssistant port. `fetch`, `baseUrl` and `model` are injectable so the
// request/response contract can be exercised offline (see
// openai-chat-assistant.test.ts) and so a compatible gateway can be pointed at
// via OPENAI_BASE_URL.

/** The provider's default endpoint root. `POST {baseUrl}/chat/completions`. */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
/** Default model when `CHAT_ASSISTANT_MODEL` is not set. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export interface OpenAiChatAssistantOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Injectable fetch, primarily for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * Builds the system message. Without grounding context it is exactly
 * `CHAT_SYSTEM_PROMPT` (the pre-guardrail contract). With context, the
 * verified facts and instructions are appended as system-level content — user
 * message text is never concatenated here.
 */
export function buildSystemMessage(context?: ChatAnswerContext): string {
  const hasGrounding =
    (context?.verifiedFacts?.length ?? 0) > 0 || (context?.instructions ?? "") !== "";
  if (!hasGrounding) return CHAT_SYSTEM_PROMPT;

  const parts = [CHAT_SYSTEM_PROMPT];
  if (context?.instructions) parts.push(context.instructions);
  if (context?.verifiedFacts && context.verifiedFacts.length > 0) {
    parts.push(
      [
        "Verified store facts (the only authoritative source):",
        ...context.verifiedFacts.map((fact) => `- ${fact}`),
      ].join("\n"),
    );
  }
  parts.push(
    "Never invent prices, shipping costs, return policies or other store facts. If a fact is not in the verified list above, say plainly that you do not know and suggest contacting the store. Only state a price that appears in the verified facts.",
  );
  return parts.join("\n\n");
}

/**
 * Creates a {@link ChatAssistant} backed by OpenAI's Chat Completions API.
 * All failures (non-2xx response, malformed body, thrown fetch) surface as a
 * typed {@link ChatAssistantError} with kind `provider`.
 */
export function createOpenAiChatAssistant(
  options: OpenAiChatAssistantOptions,
): ChatAssistant {
  const { apiKey, model = DEFAULT_OPENAI_MODEL } = options;
  const baseUrl = options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const doFetch = options.fetch ?? globalThis.fetch;
  const endpoint = buildUrl(baseUrl);

  return {
    async answer(messages: ChatMessage[], context?: ChatAnswerContext): Promise<ChatAnswer> {
      const body = {
        model,
        messages: [
          { role: "system" as const, content: buildSystemMessage(context) },
          ...messages,
        ],
        temperature: 0.3,
      };

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new ChatAssistantError(
          "The chat provider could not be reached.",
          { kind: "provider", cause },
        );
      }

      if (!response.ok) {
        throw new ChatAssistantError(
          `The chat provider returned an error (HTTP ${response.status}).`,
          { kind: "provider", status: response.status },
        );
      }

      let data: ChatCompletionsResponse;
      try {
        data = (await response.json()) as ChatCompletionsResponse;
      } catch (cause) {
        throw new ChatAssistantError(
          "The chat provider returned an unreadable response.",
          { kind: "provider", status: response.status, cause },
        );
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new ChatAssistantError(
          "The chat provider returned no answer.",
          { kind: "provider", status: response.status },
        );
      }

      return { content } satisfies ChatAnswer;
    },
  };
}
