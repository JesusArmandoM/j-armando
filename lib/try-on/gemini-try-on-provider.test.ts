import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  createGeminiTryOnProvider,
} from "./gemini-try-on-provider.ts";

describe("createGeminiTryOnProvider", () => {
  it("sends prompt and inlineData image to Gemini Image model", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "generated-base64-image-data",
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const provider = createGeminiTryOnProvider({
      apiKey: "test-gemini-key",
      model: DEFAULT_GEMINI_IMAGE_MODEL,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.generateTryOn({
      photo: {
        bytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: "image/jpeg",
        filename: "shopper.jpg",
      },
      prompt: "Dress shopper in the Silk Slip Midi Dress in Burgundy.",
    });

    expect(capturedUrl).toContain("models/gemini-2.5-flash-image:generateContent?key=test-gemini-key");
    expect(capturedBody).not.toBeNull();
    const body = capturedBody as unknown as {
      contents: Array<{
        parts: [
          { text: string },
          { inlineData: { mimeType: string; data: string } },
        ];
      }>;
    };
    expect(body.contents[0].parts[0].text).toBe(
      "Dress shopper in the Silk Slip Midi Dress in Burgundy.",
    );
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(body.contents[0].parts[1].inlineData.data).toBeTruthy();
    expect(result.image).toEqual({
      kind: "base64",
      base64: "generated-base64-image-data",
      mimeType: "image/png",
    });
  });

  it("throws TryOnProviderError when API returns non-2xx status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Quota exceeded",
    });

    const provider = createGeminiTryOnProvider({
      apiKey: "test-gemini-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      provider.generateTryOn({
        photo: {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/jpeg",
          filename: "test.jpg",
        },
        prompt: "Test",
      }),
    ).rejects.toThrow(/HTTP 429/);
  });
});
