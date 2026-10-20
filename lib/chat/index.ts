import { ChatAssistantError } from "./chat-assistant.ts";
import type { ChatAssistant } from "./chat-assistant.ts";
import { createGeminiChatAssistant } from "./gemini-chat-assistant.ts";
import {
  DEFAULT_OPENAI_MODEL,
  createOpenAiChatAssistant,
} from "./openai-chat-assistant.ts";

let cached: ChatAssistant | undefined;

/** Returns the configured {@link ChatAssistant}, creating and caching it once. */
export function getChatAssistant(): ChatAssistant {
  if (cached) return cached;

  // 1. Prioritize Google Gemini if GEMINI_API_KEY is present
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const model = process.env.GEMINI_CHAT_MODEL || process.env.CHAT_ASSISTANT_MODEL;
    const baseUrl = process.env.GEMINI_BASE_URL;
    cached = createGeminiChatAssistant({ apiKey: geminiApiKey, model, baseUrl });
    return cached;
  }

  // 2. Fallback to OpenAI / OpenAI-compatible endpoint
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ChatAssistantError(
      "The chat assistant is not configured: OPENAI_API_KEY or GEMINI_API_KEY is missing. Set it in the environment (see .env.example).",
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
