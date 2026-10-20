import type { TryOnProvider, TryOnRequest, TryOnResult } from "./try-on-provider.ts";
import { TryOnProviderError } from "./try-on-provider.ts";

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const DEFAULT_GEMINI_IMAGE_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiTryOnProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Native Google Gemini/Imagen adapter for the {@link TryOnProvider} port.
 *
 * Sends the user's photo as inlineData and the try-on prompt to Gemini Image generation,
 * receiving back the edited image in base64 without intermediate file storage.
 */
export function createGeminiTryOnProvider(
  options: GeminiTryOnProviderOptions,
): TryOnProvider {
  const apiKey = options.apiKey.trim();
  const model = options.model?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
  const baseUrl = (
    options.baseUrl?.trim() || DEFAULT_GEMINI_IMAGE_BASE_URL
  ).replace(/\/+$/, "");
  const fetchImpl = options.fetchFn ?? fetch;

  if (!apiKey) {
    throw new TryOnProviderError(
      "Gemini try-on requires an apiKey. Set GEMINI_API_KEY or TRYON_API_KEY.",
      { kind: "configuration" },
    );
  }

  return {
    async generateTryOn(request: TryOnRequest): Promise<TryOnResult> {
      const { photo, prompt } = request;

      if (!photo?.bytes || photo.bytes.length === 0) {
        throw new TryOnProviderError("A valid photo is required for try-on.", {
          kind: "provider",
        });
      }

      // Convert Uint8Array to base64
      const base64Data = Buffer.from(photo.bytes).toString("base64");

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: photo.mimeType || "image/jpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
      };

      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new TryOnProviderError(
          `Gemini Try-On network error: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "provider", cause: err },
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new TryOnProviderError(
          `Gemini Try-On failed with status HTTP ${response.status}: ${errorText}`,
          { kind: "provider", status: response.status },
        );
      }

      interface GeminiPart {
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }
      interface GeminiResponse {
        candidates?: Array<{
          content?: {
            parts?: GeminiPart[];
          };
        }>;
      }

      let data: GeminiResponse;
      try {
        data = (await response.json()) as GeminiResponse;
      } catch (err) {
        throw new TryOnProviderError(
          "Failed to parse Gemini Try-On response JSON.",
          { kind: "provider", cause: err },
        );
      }

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);

      if (!imagePart?.inlineData?.data) {
        // If the model responded with text only or no image part
        const textPart = parts.find((p) => p.text)?.text;
        throw new TryOnProviderError(
          `Gemini did not return an image: ${textPart || "No image candidate generated."}`,
          { kind: "provider" },
        );
      }

      return {
        image: {
          kind: "base64",
          base64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType || "image/png",
        },
      };
    },
  };
}
