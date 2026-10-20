import { createGeminiTryOnProvider } from "./gemini-try-on-provider.ts";
import { createOpenAiImagesTryOnProvider } from "./openai-images-try-on-provider.ts";
import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnProvider } from "./try-on-provider.ts";

let cached: TryOnProvider | undefined;

/** Resolves the provider key from the documented fallback chain. */
function resolveApiKey(): string | undefined {
  return (
    process.env.TRYON_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.DEVEXPERT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    undefined
  );
}

/** Returns the configured {@link TryOnProvider}, creating and caching it once. */
export function getTryOnProvider(): TryOnProvider {
  if (cached) return cached;

  const providerType = process.env.TRYON_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai");

  // 1. Google Gemini Native Image Provider
  if (providerType === "gemini" || process.env.GEMINI_API_KEY) {
    const apiKey = process.env.GEMINI_API_KEY || resolveApiKey();
    if (apiKey) {
      const model = process.env.GEMINI_IMAGE_MODEL || process.env.TRYON_MODEL;
      const baseUrl = process.env.GEMINI_BASE_URL;
      cached = createGeminiTryOnProvider({ apiKey, model, baseUrl });
      return cached;
    }
  }

  // 2. OpenAI / Compatible Image-Edits Provider
  const baseUrl = process.env.TRYON_BASE_URL;
  const model = process.env.TRYON_MODEL;
  const apiKey = resolveApiKey();

  if (!baseUrl || !model || !apiKey) {
    throw new TryOnProviderError(
      "Virtual try-on is not configured: TRYON_BASE_URL, TRYON_MODEL and an API key (TRYON_API_KEY, GEMINI_API_KEY, DEVEXPERT_API_KEY or OPENAI_API_KEY) are required. See .env.example.",
      { kind: "configuration" },
    );
  }

  cached = createOpenAiImagesTryOnProvider({ apiKey, baseUrl, model });
  return cached;
}

/** Clears the cached instance. Intended for tests and configuration changes. */
export function resetTryOnProvider(): void {
  cached = undefined;
}
