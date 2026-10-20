import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GEMINI_CHAT_MODEL,
  createGeminiChatAssistant,
} from "./gemini-chat-assistant.ts";

describe("createGeminiChatAssistant", () => {
  it("formats messages and systemInstruction correctly", async () => {
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
                parts: [{ text: "Hello! Welcome to J. Armando." }],
              },
            },
          ],
        }),
      };
    });

    const assistant = createGeminiChatAssistant({
      apiKey: "test-gemini-key",
      model: DEFAULT_GEMINI_CHAT_MODEL,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await assistant.answer(
      [
        { role: "user", content: "What is the return policy?" },
        { role: "assistant", content: "We offer 30-day returns." },
        { role: "user", content: "Can I exchange?" },
      ],
      {
        instructions: "You are a luxury assistant.",
        verifiedFacts: ["Store is US based", "Express shipping is $15"],
      },
    );

    expect(capturedUrl).toContain("models/gemini-2.5-flash:generateContent?key=test-gemini-key");
    expect(capturedBody).not.toBeNull();
    const body = capturedBody as unknown as { contents: Array<{ role: string }>; systemInstruction: { parts: Array<{ text: string }> } };
    expect(body.contents).toHaveLength(3);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[1].role).toBe("model");
    expect(body.systemInstruction.parts[0].text).toContain("You are a luxury assistant.");
    expect(body.systemInstruction.parts[0].text).toContain("Store is US based");
    expect(result.content).toBe("Hello! Welcome to J. Armando.");
  });

  it("throws ChatAssistantError on API error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    const assistant = createGeminiChatAssistant({
      apiKey: "test-gemini-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      assistant.answer([{ role: "user", content: "Hi" }]),
    ).rejects.toThrow(/HTTP 403/);
  });
});
