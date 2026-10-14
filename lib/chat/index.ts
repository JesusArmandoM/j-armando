import { ChatAssistantError } from "./chat-assistant.ts";
import type { ChatAssistant } from "./chat-assistant.ts";
import {
  DEFAULT_OPENAI_MODEL,
  createOpenAiChatAssistant,
} from "./openai-chat-assistant.ts";

// Env-driven factory for the storefront chat capability. Configuration is read
// lazily at call time (never at module load), so `next build` succeeds without
// a provider key. The instance is cached for the process.
//
//   OPENAI_API_KEY       required to build the adapter
//   CHAT_ASSISTANT_MODEL optional, defaults to gpt-4o-mini
//   OPENAI_BASE_URL      optional, defaults to https://api.openai.com/v1

let cached: ChatAssistant | undefined;

/** Returns the configured {@link ChatAssistant}, creating and caching it once. */
export function getChatAssistant(): ChatAssistant {
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ChatAssistantError(
      "The chat assistant is not configured: OPENAI_API_KEY is missing. Set it in the environment (see .env.example).",
      { kind: "configuration" },
    );
  }

  const model = process.env.CHAT_ASSISTANT_MODEL || DEFAULT_OPENAI_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL || undefined;

  cached = createOpenAiChatAssistant({ apiKey, model, baseUrl });
  return cached;
}

/** Clears the cached instance. Intended for tests and configuration changes. */
export function resetChatAssistant(): void {
  cached = undefined;
}
