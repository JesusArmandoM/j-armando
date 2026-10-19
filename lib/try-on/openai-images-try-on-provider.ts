import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnProvider, TryOnResult } from "./try-on-provider.ts";

// OpenAI-compatible images adapter (DevExpert gateway today). This is the real
// provider integration behind the TryOnProvider port. `fetch`, `baseUrl` and
// `model` are injectable so the multipart request/response contract can be
// exercised offline (see openai-images-try-on-provider.test.ts).
//
// `baseUrl` is the API base INCLUDING the version segment, exactly like
// OPENAI_BASE_URL: the only path appended here is `/images/edits`. With
// `https://inference.devexpert.io/v1` the endpoint is
// `https://inference.devexpert.io/v1/images/edits` — never a second `/v1`.
//
// Privacy: the photo is streamed to the provider in memory. A returned URL is
// passed through untouched; the server never fetches, stores or logs it.

/** Provider id, for diagnostics only. Never sent to the browser. */
export const TRY_ON_PROVIDER_ID = "devexpert-images";

export interface OpenAiImagesTryOnProviderOptions {
  apiKey: string;
  /** API base including the version segment, e.g. `https://.../v1`. */
  baseUrl: string;
  /** Image-edit model, e.g. `image-edit`. */
  model: string;
  /** Injectable fetch, primarily for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface ImagesResponse {
  data?: Array<{ b64_json?: unknown; url?: unknown }>;
}

/** Joins the API base with `/images/edits`, tolerating trailing slashes. */
export function buildImagesEditsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/edits`;
}

/**
 * Infers the result MIME type from the base64 header (the images API does not
 * echo one). Only the first bytes are inspected; the image is never logged.
 */
export function detectImageMimeType(base64: string): string {
  try {
    const binary = atob(base64.slice(0, 24));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  } catch {
    // Fall through to the safe default.
  }
  return "image/png";
}

/**
 * Creates a {@link TryOnProvider} backed by an OpenAI-compatible images API.
 * All failures (non-2xx response, malformed body, thrown fetch) surface as a
 * typed {@link TryOnProviderError} with kind `provider`, containing neither
 * bytes nor provider response data.
 */
export function createOpenAiImagesTryOnProvider(
  options: OpenAiImagesTryOnProviderOptions,
): TryOnProvider {
  const { apiKey, baseUrl, model } = options;
  const doFetch = options.fetch ?? globalThis.fetch;
  const endpoint = buildImagesEditsUrl(baseUrl);

  return {
    async generateTryOn({ photo, prompt }): Promise<TryOnResult> {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      // Copy into a fresh Uint8Array so the Blob owns an ArrayBuffer-backed view.
      form.append(
        "image",
        new Blob([new Uint8Array(photo.bytes)], { type: photo.mimeType }),
        photo.filename,
      );
      form.append("n", "1");

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          // Do not set content-type: fetch supplies the multipart boundary.
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } catch (cause) {
        throw new TryOnProviderError("The try-on provider could not be reached.", {
          kind: "provider",
          cause,
        });
      }

      if (!response.ok) {
        throw new TryOnProviderError(
          `The try-on provider returned an error (HTTP ${response.status}).`,
          { kind: "provider", status: response.status },
        );
      }

      let data: ImagesResponse;
      try {
        data = (await response.json()) as ImagesResponse;
      } catch (cause) {
        throw new TryOnProviderError("The try-on provider returned an unreadable response.", {
          kind: "provider",
          status: response.status,
          cause,
        });
      }

      const first = data?.data?.[0];
      if (typeof first?.b64_json === "string" && first.b64_json !== "") {
        return {
          image: {
            kind: "base64",
            base64: first.b64_json,
            mimeType: detectImageMimeType(first.b64_json),
          },
        };
      }
      if (typeof first?.url === "string" && first.url !== "") {
        return { image: { kind: "url", url: first.url } };
      }

      throw new TryOnProviderError("The try-on provider returned no image.", {
        kind: "provider",
        status: response.status,
      });
    },
  };
}
