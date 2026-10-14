import {
  CHAT_SYSTEM_PROMPT,
  ChatAssistantError,
} from "./chat-assistant.ts";
import type {
  ChatAnswer,
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
    async answer(messages: ChatMessage[]): Promise<ChatAnswer> {
      const body = {
        model,
        messages: [
          { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
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
