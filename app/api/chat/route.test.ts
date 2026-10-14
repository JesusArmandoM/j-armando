import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatAssistantError } from "@/lib/chat/chat-assistant.ts";
import type { ChatAssistant } from "@/lib/chat/chat-assistant.ts";

vi.mock("@/lib/chat/index.ts", () => ({
  getChatAssistant: vi.fn(),
}));

import { getChatAssistant } from "@/lib/chat/index.ts";
import { POST } from "./route";

const getAssistantMock = vi.mocked(getChatAssistant);

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function brokenJsonRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  } as unknown as Request;
}

function fakeAssistant(answer: string): ChatAssistant {
  return { answer: vi.fn<ChatAssistant["answer"]>(async () => ({ content: answer })) };
}

beforeEach(() => {
  getAssistantMock.mockReset();
});

describe("POST /api/chat", () => {
  it("delegates to the assistant and returns { reply } unchanged", async () => {
    const answerSpy = vi.fn<ChatAssistant["answer"]>(async () => ({
      content: "Sizes run true to measure.",
    }));
    getAssistantMock.mockReturnValue({ answer: answerSpy });

    const response = await POST(
      jsonRequest({
        messages: [{ role: "user", content: "How does sizing work?" }],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "Sizes run true to measure.",
    });
    expect(answerSpy).toHaveBeenCalledWith([
      { role: "user", content: "How does sizing work?" },
    ]);
  });

  it("forwards the shopper's exact message content to the assistant", async () => {
    const answerSpy = vi.fn<ChatAssistant["answer"]>(async () => ({
      content: "Merino wool.",
    }));
    getAssistantMock.mockReturnValue({ answer: answerSpy });
    const question = "What fabric is the merino blazer made of?";

    await POST(jsonRequest({ messages: [{ role: "user", content: question }] }));

    const forwarded = answerSpy.mock.calls[0][0];
    expect(forwarded).toEqual([{ role: "user", content: question }]);
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(brokenJsonRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty("error");
    expect(getAssistantMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed or empty messages array", async () => {
    for (const body of [
      {},
      { messages: [] },
      { messages: "hi" },
      { messages: [{ role: "system", content: "x" }] },
      { messages: [{ role: "user", content: "  " }] },
      { messages: [{ role: "user" }] },
    ]) {
      const response = await POST(jsonRequest(body));
      expect(response.status).toBe(400);
    }
    expect(getAssistantMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the assistant is not configured (missing key)", async () => {
    getAssistantMock.mockImplementation(() => {
      throw new ChatAssistantError("OPENAI_API_KEY is missing.", {
        kind: "configuration",
      });
    });

    const response = await POST(
      jsonRequest({ messages: [{ role: "user", content: "Hi" }] }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  it("returns 502 when the provider errors", async () => {
    getAssistantMock.mockReturnValue({
      answer: vi.fn(async () => {
        throw new ChatAssistantError("provider down", { kind: "provider", status: 500 });
      }),
    });

    const response = await POST(
      jsonRequest({ messages: [{ role: "user", content: "Hi" }] }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  it("swapping the ChatAssistant implementation changes no route code (scenario 3)", async () => {
    // A different implementation behind the same port: its reply is returned
    // unchanged, proving the seam is the port and not the provider.
    getAssistantMock.mockReturnValue(fakeAssistant("A completely different reply."));

    const response = await POST(
      jsonRequest({ messages: [{ role: "user", content: "Anything" }] }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "A completely different reply.",
    });
  });
});
