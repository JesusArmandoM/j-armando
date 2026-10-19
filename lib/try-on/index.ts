import { createOpenAiImagesTryOnProvider } from "./openai-images-try-on-provider.ts";
import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnProvider } from "./try-on-provider.ts";

// Env-driven factory for virtual try-on. Configuration is read lazily at call
// time (never at module load), so `next build` succeeds with no try-on
// variables set. The instance is cached for the process.
//
//   TRYON_BASE_URL  required; API base INCLUDING `/v1`
//                   (e.g. https://inference.devexpert.io/v1)
//   TRYON_MODEL     required; image-edit model (e.g. image-edit)
//   TRYON_API_KEY   optional; falls back to DEVEXPERT_API_KEY, then
//                   OPENAI_API_KEY
//
// Keys are server-side only and are never exposed via NEXT_PUBLIC_*.

let cached: TryOnProvider | undefined;

/** Resolves the provider key from the documented fallback chain. */
function resolveApiKey(): string | undefined {
  return (
    process.env.TRYON_API_KEY ||
    process.env.DEVEXPERT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    undefined
  );
}

/** Returns the configured {@link TryOnProvider}, creating and caching it once. */
export function getTryOnProvider(): TryOnProvider {
  if (cached) return cached;

  const baseUrl = process.env.TRYON_BASE_URL;
  const model = process.env.TRYON_MODEL;
  const apiKey = resolveApiKey();

  if (!baseUrl || !model || !apiKey) {
    throw new TryOnProviderError(
      "Virtual try-on is not configured: TRYON_BASE_URL, TRYON_MODEL and an API key (TRYON_API_KEY, DEVEXPERT_API_KEY or OPENAI_API_KEY) are required. See .env.example.",
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
