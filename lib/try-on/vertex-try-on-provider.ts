import type { TryOnProvider, TryOnRequest, TryOnResult } from "./try-on-provider.ts";
import { TryOnProviderError } from "./try-on-provider.ts";
import { getGoogleCloudAccessToken, getServiceAccountCredentials } from "../ai/google-auth.ts";

export const DEFAULT_VERTEX_IMAGE_MODEL = "gemini-2.5-flash-image";
export const DEFAULT_VERTEX_LOCATION = "us-central1";

export interface VertexTryOnProviderOptions {
  model?: string;
  location?: string;
  projectId?: string;
  fetchFn?: typeof fetch;
}

export function createVertexTryOnProvider(
  options: VertexTryOnProviderOptions = {},
): TryOnProvider {
  const model = options.model?.trim() || DEFAULT_VERTEX_IMAGE_MODEL;
  const location = options.location?.trim() || DEFAULT_VERTEX_LOCATION;
  const fetchImpl = options.fetchFn ?? fetch;

  return {
    async generateTryOn(request: TryOnRequest): Promise<TryOnResult> {
      const { photo, prompt } = request;

      if (!photo?.bytes || photo.bytes.length === 0) {
        throw new TryOnProviderError("A valid photo is required for try-on.", {
          kind: "provider",
        });
      }

      let credentials;
      let token: string;
      try {
        credentials = getServiceAccountCredentials();
        token = await getGoogleCloudAccessToken();
      } catch (err) {
        throw new TryOnProviderError(
          `Google Cloud Vertex AI auth failed: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "configuration", cause: err },
        );
      }

      const projectId = options.projectId || credentials.project_id;
      const base64Data = Buffer.from(photo.bytes).toString("base64");

      const body = {
        contents: [
          {
            role: "user",
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
        throw new TryOnProviderError(
          `Vertex Try-On network error: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "provider", cause: err },
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new TryOnProviderError(
          `Vertex Try-On failed with status HTTP ${response.status}: ${errorText}`,
          { kind: "provider", status: response.status },
        );
      }

      interface VertexPart {
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }
      interface VertexResponse {
        candidates?: Array<{
          content?: {
            parts?: VertexPart[];
          };
        }>;
      }

      let data: VertexResponse;
      try {
        data = (await response.json()) as VertexResponse;
      } catch (err) {
        throw new TryOnProviderError(
          "Failed to parse Vertex Try-On response JSON.",
          { kind: "provider", cause: err },
        );
      }

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);

      if (!imagePart?.inlineData?.data) {
        const textPart = parts.find((p) => p.text)?.text;
        throw new TryOnProviderError(
          `Vertex AI did not return an image: ${textPart || "No image candidate generated."}`,
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
