import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CHAT_SYSTEM_PROMPT, ChatAssistantError } from "./chat-assistant.ts";
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  createOpenAiChatAssistant,
} from "./openai-chat-assistant.ts";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okPayload(content: string) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

describe("createOpenAiChatAssistant (contract, injected fetch)", () => {
  it("posts the model, system prompt and conversation to the chat-completions endpoint with a bearer header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(okPayload("Our sizes run true to measure.")),
    );
    const assistant = createOpenAiChatAssistant({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      fetch: fetchMock,
    });

    const messages = [
      { role: "user" as const, content: "How does sizing work?" },
      { role: "assistant" as const, content: "Sizes run true to measure." },
      { role: "user" as const, content: "And the care instructions?" },
    ];

    await assistant.answer(messages);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_OPENAI_BASE_URL}/chat/completions`);
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: CHAT_SYSTEM_PROMPT,
    });
    expect(body.messages.slice(1)).toEqual(messages);
  });

  it("merges verified facts and guardrail instructions into the system message", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(okPayload("The overcoat is dry clean only.")),
    );
    const assistant = createOpenAiChatAssistant({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const userMessage = "How should I care for the Longline Wool Overcoat?";

    await assistant.answer(
      [{ role: "user", content: userMessage }],
      {
        instructions: "Only use verified store facts.",
        verifiedFacts: [
          "The Longline Wool Overcoat is $349.00 (USD, tax-exclusive).",
          "Care: Dry clean only.",
        ],
      },
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const system = body.messages[0];
    expect(system.role).toBe("system");
    expect(system.content).toContain(CHAT_SYSTEM_PROMPT);
    expect(system.content).toContain("Only use verified store facts.");
    expect(system.content).toContain(
      "Verified store facts (the only authoritative source):",
    );
    expect(system.content).toContain("- The Longline Wool Overcoat is $349.00 (USD, tax-exclusive).");
    expect(system.content).toContain("- Care: Dry clean only.");
    expect(system.content).toContain("Never invent prices");
    // User content stays in the conversation, never in the system message.
    expect(system.content).not.toContain(userMessage);
    expect(body.messages[1]).toEqual({ role: "user", content: userMessage });
  });

  it("parses the provider's message content into a ChatAnswer", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(okPayload("It is a lightweight merino.")));
    const assistant = createOpenAiChatAssistant({ apiKey: "k", fetch: fetchMock });

    const answer = await assistant.answer([
      { role: "user", content: "What is the blazer made of?" },
    ]);

    expect(answer).toEqual({ content: "It is a lightweight merino." });
  });

  it("defaults the model and base URL when not provided", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(okPayload("Hello.")));
    const assistant = createOpenAiChatAssistant({ apiKey: "k", fetch: fetchMock });

    await assistant.answer([{ role: "user", content: "Hi" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_OPENAI_BASE_URL}/chat/completions`);
    expect(JSON.parse(String(init?.body)).model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("honours an injected baseUrl (trailing slash tolerant)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(okPayload("ok")));
    const assistant = createOpenAiChatAssistant({
      apiKey: "k",
      baseUrl: "http://gateway.test/v1/",
      fetch: fetchMock,
    });

    await assistant.answer([{ role: "user", content: "Hi" }]);

    expect(fetchMock.mock.calls[0][0]).toBe("http://gateway.test/v1/chat/completions");
  });

  it("throws a typed provider error on a non-2xx response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("nope", { status: 401 }));
    const assistant = createOpenAiChatAssistant({ apiKey: "bad", fetch: fetchMock });

    await expect(
      assistant.answer([{ role: "user", content: "Hi" }]),
    ).rejects.toMatchObject({
      name: "ChatAssistantError",
      kind: "provider",
      status: 401,
    });
  });

  it("throws a typed provider error on a malformed body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [] }));
    const assistant = createOpenAiChatAssistant({ apiKey: "k", fetch: fetchMock });

    await expect(
      assistant.answer([{ role: "user", content: "Hi" }]),
    ).rejects.toBeInstanceOf(ChatAssistantError);
  });

  it("wraps a thrown fetch in a typed provider error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket hang up"));
    const assistant = createOpenAiChatAssistant({ apiKey: "k", fetch: fetchMock });

    await expect(
      assistant.answer([{ role: "user", content: "Hi" }]),
    ).rejects.toMatchObject({ name: "ChatAssistantError", kind: "provider" });
  });
});

// End-to-end offline: the real adapter runs against a tiny in-process HTTP
// server that speaks the OpenAI chat-completions response contract over real
// HTTP. This exercises the actual fetch path with no live network call.
describe("createOpenAiChatAssistant (integration over real HTTP)", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  const received: { authorization?: string; body?: unknown } = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.authorization = req.headers.authorization;
        try {
          received.body = JSON.parse(raw);
        } catch {
          received.body = raw;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(okPayload("Merino wool, dry clean only.")));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("reaches the endpoint over HTTP and returns the provider's content", async () => {
    const assistant = createOpenAiChatAssistant({
      apiKey: "integration-key",
      model: "gpt-4o-mini",
      baseUrl,
    });

    const answer = await assistant.answer([
      { role: "user", content: "What fabric is the blazer made of?" },
    ]);

    expect(answer.content).toBe("Merino wool, dry clean only.");
    expect(received.authorization).toBe("Bearer integration-key");
    const body = received.body as { model: string; messages: unknown[] };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: CHAT_SYSTEM_PROMPT,
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "What fabric is the blazer made of?",
    });
  });
});
