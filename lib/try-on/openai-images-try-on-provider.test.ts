// @vitest-environment node

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  buildImagesEditsUrl,
  createOpenAiImagesTryOnProvider,
} from "./openai-images-try-on-provider.ts";
import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnPhoto } from "./try-on-provider.ts";

const photo: TryOnPhoto = {
  bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  mimeType: "image/png",
  filename: "shopper-photo.png",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createOpenAiImagesTryOnProvider (contract, injected fetch)", () => {
  it("posts multipart form data to {baseUrl}/images/edits with a bearer header", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [{ b64_json: "AAAA" }] }));
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "test-key",
      baseUrl: "https://inference.devexpert.io/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    await provider.generateTryOn({ photo, prompt: "Dress the person in the coat." });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // The API base already includes /v1: the adapter appends only /images/edits.
    expect(url).toBe("https://inference.devexpert.io/v1/images/edits");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    // fetch must supply the multipart boundary itself.
    expect(headers["content-type"]).toBeUndefined();

    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("image-edit");
    expect(form.get("prompt")).toBe("Dress the person in the coat.");
    expect(form.get("n")).toBe("1");

    const image = form.get("image") as File;
    expect(image.name).toBe("shopper-photo.png");
    expect(image.type).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(photo.bytes);
  });

  it("tolerates trailing slashes without duplicating /v1", () => {
    expect(buildImagesEditsUrl("https://inference.devexpert.io/v1/")).toBe(
      "https://inference.devexpert.io/v1/images/edits",
    );
    expect(buildImagesEditsUrl("https://inference.devexpert.io/v1///")).toBe(
      "https://inference.devexpert.io/v1/images/edits",
    );
  });

  it("prefers data[0].b64_json and returns a base64 image", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [{ b64_json: "iVBORw0KGgo=", url: "https://provider.example/image.png" }],
      }),
    );
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const result = await provider.generateTryOn({ photo, prompt: "prompt" });

    expect(result.image).toEqual({
      kind: "base64",
      base64: "iVBORw0KGgo=",
      mimeType: "image/png",
    });
  });

  it("detects the returned image MIME type from its header without logging bytes", async () => {
    // JPEG magic bytes (FF D8 FF E0 ... JFIF) — the gateway returns JPEG data.
    const jpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [{ b64_json: jpegBase64 }] }));
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const result = await provider.generateTryOn({ photo, prompt: "prompt" });

    expect(result.image).toEqual({
      kind: "base64",
      base64: jpegBase64,
      mimeType: "image/jpeg",
    });
  });

  it("falls back to data[0].url and passes it through untouched", async () => {
    const url = "https://provider.example/generated/abc.png";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [{ url }] }));
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const result = await provider.generateTryOn({ photo, prompt: "prompt" });

    expect(result.image).toEqual({ kind: "url", url });
    // Only the edits call was made: the returned URL is never downloaded.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a typed provider error on a non-2xx response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("provider body with sensitive data", { status: 429 }),
    );
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const error = await provider
      .generateTryOn({ photo, prompt: "prompt" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TryOnProviderError);
    expect(error).toMatchObject({ kind: "provider", status: 429 });
    expect((error as Error).message).not.toContain("sensitive");
    expect((error as Error).message).not.toContain("137");
  });

  it("throws a typed provider error on a malformed body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const error = await provider
      .generateTryOn({ photo, prompt: "prompt" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TryOnProviderError);
    expect(error).toMatchObject({ kind: "provider" });
    expect((error as Error).message).not.toContain(photo.filename);
  });

  it("wraps a thrown fetch in a typed provider error without photo bytes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket hang up"));
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "k",
      baseUrl: "https://gateway.test/v1",
      model: "image-edit",
      fetch: fetchMock,
    });

    const error = await provider
      .generateTryOn({ photo, prompt: "prompt" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TryOnProviderError);
    expect(error).toMatchObject({ kind: "provider" });
    expect((error as Error).message).toBe("The try-on provider could not be reached.");
  });
});

// End-to-end offline: the real adapter runs against a tiny in-process HTTP
// server that speaks the OpenAI images response contract over real HTTP. No
// live network call and no provider key.
describe("createOpenAiImagesTryOnProvider (integration over real HTTP)", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  const received: { authorization?: string; contentType?: string; body?: string } = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk.toString();
      });
      req.on("end", () => {
        received.authorization = req.headers.authorization;
        received.contentType = req.headers["content-type"];
        received.body = raw;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ b64_json: "b3ZlcmNvYXRfcmVzdWx0" }] }));
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

  it("reaches the endpoint over HTTP and returns the provider image", async () => {
    const provider = createOpenAiImagesTryOnProvider({
      apiKey: "integration-key",
      baseUrl,
      model: "image-edit",
    });

    const result = await provider.generateTryOn({
      photo,
      prompt: "Dress the person in the overcoat.",
    });

    expect(result.image).toEqual({
      kind: "base64",
      base64: "b3ZlcmNvYXRfcmVzdWx0",
      mimeType: "image/png",
    });
    expect(received.authorization).toBe("Bearer integration-key");
    expect(received.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(received.body).toContain('name="model"');
    expect(received.body).toContain("image-edit");
    expect(received.body).toContain('name="prompt"');
    expect(received.body).toContain("Dress the person in the overcoat.");
    expect(received.body).toContain('name="image"; filename="shopper-photo.png"');
    expect(received.body).toContain("image/png");
    expect(received.body).toContain('name="n"');
  });
});
