import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatAssistantError } from "@/lib/chat/chat-assistant.ts";
import type { ChatAssistant } from "@/lib/chat/chat-assistant.ts";
import type { ProductFact } from "@/lib/chat/guardrails/product-match.ts";
import { STORE_KNOWLEDGE } from "@/lib/chat/guardrails/store-knowledge.ts";

vi.mock("@/lib/chat/index.ts", () => ({
  getChatAssistant: vi.fn(),
}));

// The composition module resolves the DB handle and catalog reader lazily;
// these mocks keep the route tests offline and database-free.
vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/catalog.ts", () => ({
  listPublishedProductFacts: vi.fn(),
}));

import { listPublishedProductFacts } from "@/db/catalog.ts";
import { getChatAssistant } from "@/lib/chat/index.ts";
import { POST } from "./route";

const getAssistantMock = vi.mocked(getChatAssistant);
const listPublishedProductFactsMock = vi.mocked(listPublishedProductFacts);

const overcoat: ProductFact = {
  slug: "longline-wool-overcoat",
  name: "Longline Wool Overcoat",
  description: "A full-length overcoat.",
  composition: "Shell: 70% wool.",
  care: "Dry clean only.",
  basePriceCents: 34900,
  currency: "USD",
  categorySlug: "coats",
  categoryName: "Coats",
  variants: [{ size: "M", color: "Camel", stockQty: 14 }],
};

function factAnswer(id: string): string {
  const found = STORE_KNOWLEDGE.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing fact ${id}`);
  return found.answer;
}

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

function chatRequest(content: string): Request {
  return jsonRequest({ messages: [{ role: "user", content }] });
}

function unavailableProvider(): never {
  throw new ChatAssistantError("OPENAI_API_KEY is missing.", {
    kind: "configuration",
  });
}

beforeEach(() => {
  getAssistantMock.mockReset();
  // Simulate "no provider key configured" for every test unless overridden.
  getAssistantMock.mockImplementation(unavailableProvider);
  listPublishedProductFactsMock.mockReset();
  listPublishedProductFactsMock.mockResolvedValue([overcoat]);
});

describe("POST /api/chat", () => {
  it("answers a shipping-cost question with the verified unknown copy and no provider key", async () => {
    const response = await POST(chatRequest("How much does shipping cost?"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: factAnswer("shipping-cost"),
    });
    expect(getAssistantMock).not.toHaveBeenCalled();
  });

  it("answers a catalog price question from the DB facts and no provider key", async () => {
    const response = await POST(chatRequest("How much is the Longline Wool Overcoat?"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { reply: string };
    expect(body.reply).toBe(
      "The Longline Wool Overcoat is $349.00 (USD, tax-exclusive).",
    );
    expect(getAssistantMock).not.toHaveBeenCalled();
    expect(listPublishedProductFactsMock).toHaveBeenCalledTimes(1);
  });

  it("delegates an in-scope question to the assistant and returns { reply } unchanged", async () => {
    const answerSpy = vi.fn<ChatAssistant["answer"]>(async () => ({
      content: "Sizes run true to measure.",
    }));
    getAssistantMock.mockReturnValue({ answer: answerSpy });

    const response = await POST(
      chatRequest("Would the Longline Wool Overcoat work for a winter wedding?"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "Sizes run true to measure.",
    });
    expect(answerSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards the shopper's exact message content to the assistant", async () => {
    const answerSpy = vi.fn<ChatAssistant["answer"]>(async () => ({
      content: "Merino wool.",
    }));
    getAssistantMock.mockReturnValue({ answer: answerSpy });
    const question = "What fabric is the merino sweater made of?";

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

  it("returns 503 when an in-scope question needs an unconfigured provider", async () => {
    const response = await POST(
      chatRequest("Would the Longline Wool Overcoat work for a winter wedding?"),
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
      chatRequest("Would the Longline Wool Overcoat work for a winter wedding?"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  it("swapping the ChatAssistant implementation changes no route code (scenario 3)", async () => {
    const answerSpy = vi.fn<ChatAssistant["answer"]>(async () => ({
      content: "A completely different reply.",
    }));
    getAssistantMock.mockReturnValue({ answer: answerSpy });

    const response = await POST(
      chatRequest("Would the Longline Wool Overcoat work for a winter wedding?"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: "A completely different reply.",
    });
  });
});
