// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as catalogDb from "@/db/catalog.ts";
import type { TryOnGarmentContext } from "@/db/catalog.ts";
import { TryOnProviderError } from "@/lib/try-on/try-on-provider.ts";
import type { TryOnProvider } from "@/lib/try-on/try-on-provider.ts";

vi.mock("@/db/client.ts", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/try-on/index.ts", () => ({
  getTryOnProvider: vi.fn(),
}));

import { getTryOnProvider } from "@/lib/try-on/index.ts";
import { POST } from "./route";

const getProviderMock = vi.mocked(getTryOnProvider);

const garment: TryOnGarmentContext = {
  productId: "prod-1",
  slug: "longline-wool-overcoat",
  name: "Longline Wool Overcoat",
  composition: "Shell: 70% wool, 20% polyester, 10% cashmere.",
  size: "M",
  color: "Camel",
  colorHex: "#C19A6B",
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PHOTO_BYTES = new Uint8Array([...PNG_MAGIC, 1, 2, 3, 4]);
const MAX_BYTES = 4 * 1024 * 1024;

function pngBytes(size = 16): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_MAGIC, 0);
  return bytes;
}

function formRequest(fields: Record<string, string | File> = {}): Request {
  const form = new FormData();
  const defaults: Record<string, string | File> = {
    photo: new File([PHOTO_BYTES], "shopper.png", { type: "image/png" }),
    productSlug: "longline-wool-overcoat",
    size: "M",
    color: "Camel",
    consent: "accepted",
  };
  for (const [name, value] of Object.entries({ ...defaults, ...fields })) {
    form.append(name, value);
  }
  return new Request("http://localhost/api/try-on", { method: "POST", body: form });
}

function providerReturning(result: Awaited<ReturnType<TryOnProvider["generateTryOn"]>>): {
  provider: TryOnProvider;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async () => result);
  return { provider: { generateTryOn: spy }, spy };
}

function providerFailing(error: unknown): void {
  getProviderMock.mockReturnValue({
    generateTryOn: vi.fn(async () => {
      throw error;
    }),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  getProviderMock.mockReset();
  vi.spyOn(catalogDb, "getTryOnGarmentContext").mockResolvedValue(garment);
});

describe("POST /api/try-on", () => {
  it("returns the generated image and a no-store response on the happy path", async () => {
    const { provider, spy } = providerReturning({
      image: { kind: "base64", base64: "cmVzdWx0", mimeType: "image/png" },
    });
    getProviderMock.mockReturnValue(provider);

    const response = await POST(formRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      image: { kind: "base64", base64: "cmVzdWx0", mimeType: "image/png" },
    });

    expect(catalogDb.getTryOnGarmentContext).toHaveBeenCalledWith(
      {},
      "longline-wool-overcoat",
      "M",
      "Camel",
    );

    const forwarded = spy.mock.calls[0][0] as {
      photo: { bytes: Uint8Array; mimeType: string; filename: string };
      prompt: string;
    };
    expect(forwarded.photo.bytes).toEqual(PHOTO_BYTES);
    expect(forwarded.photo.mimeType).toBe("image/png");
    expect(forwarded.photo.filename).toBe("shopper.png");
    expect(forwarded.prompt).toContain("Longline Wool Overcoat");
    expect(forwarded.prompt).toContain("Camel");
    expect(forwarded.prompt).toContain("size M");
    expect(forwarded.prompt).toContain("Shell: 70% wool");
  });

  it("returns 400 invalid_request for a malformed body", async () => {
    const request = new Request("http://localhost/api/try-on", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not multipart",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_request" });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_photo for an empty photo before any catalog or provider call (scenario 1)", async () => {
    const response = await POST(
      formRequest({ photo: new File([], "empty.png", { type: "image/png" }) }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Choose a photo to try on.",
      code: "invalid_photo",
    });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_photo for a non-image declared type before any catalog or provider call (scenario 1)", async () => {
    const response = await POST(
      formRequest({
        photo: new File([new TextEncoder().encode("hello")], "notes.txt", {
          type: "text/plain",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Choose a JPG, PNG or WebP photo.",
      code: "invalid_photo",
    });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_photo for an oversized photo before any catalog or provider call (scenario 2)", async () => {
    const response = await POST(
      formRequest({
        photo: new File([pngBytes(MAX_BYTES + 1)], "large.png", { type: "image/png" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Choose a photo smaller than 4 MB.",
      code: "invalid_photo",
    });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 4 MiB (inclusive boundary) and calls the provider (scenario 2)", async () => {
    const { provider, spy } = providerReturning({
      image: { kind: "base64", base64: "cmVzdWx0", mimeType: "image/png" },
    });
    getProviderMock.mockReturnValue(provider);

    const response = await POST(
      formRequest({
        photo: new File([pngBytes(MAX_BYTES)], "limit.png", { type: "image/png" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const forwarded = spy.mock.calls[0][0] as { photo: { bytes: Uint8Array } };
    expect(forwarded.photo.bytes.byteLength).toBe(MAX_BYTES);
  });

  it("rejects a spoofed extension whose bytes are not PNG/JPEG/WebP before any catalog or provider call (scenario 1)", async () => {
    const response = await POST(
      formRequest({
        photo: new File([new TextEncoder().encode("plain text renamed")], "spoofed.png", {
          type: "image/png",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "That file doesn't look like a JPG, PNG or WebP photo. Choose another image.",
      code: "invalid_photo",
    });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_request for missing fields after a valid photo", async () => {
    const bodies = [formRequest({ productSlug: "" }), formRequest({ color: "" })];

    for (const request of bodies) {
      const response = await POST(request);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalid_request" });
    }
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 not_available for an invalid variant size without a catalog or provider call", async () => {
    const response = await POST(formRequest({ size: "XXXL" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This garment is not available for try-on.",
      code: "not_available",
    });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 consent_required without a catalog or provider call", async () => {
    const response = await POST(formRequest({ consent: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "consent_required" });
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 not_available for an unknown, draft, archived or discontinued combination without a provider call", async () => {
    vi.mocked(catalogDb.getTryOnGarmentContext).mockResolvedValue(undefined);

    const response = await POST(formRequest({ productSlug: "cropped-tweed-jacket" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This garment is not available for try-on.",
      code: "not_available",
    });
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 503 provider_unavailable when the catalog lookup fails", async () => {
    vi.mocked(catalogDb.getTryOnGarmentContext).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await POST(formRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "The virtual try-on is temporarily unavailable.",
      code: "provider_unavailable",
    });
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 504 provider_timeout with no-store and no provider text (scenario 3)", async () => {
    providerFailing(
      new TryOnProviderError("provider body that must not leak", { kind: "timeout" }),
    );

    const response = await POST(formRequest());

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "The try-on took too long to finish. Please try again.",
      code: "provider_timeout",
    });
  });

  it("returns 503 provider_unavailable when the provider is not configured", async () => {
    getProviderMock.mockImplementation(() => {
      throw new TryOnProviderError("Virtual try-on is not configured.", {
        kind: "configuration",
      });
    });

    const response = await POST(formRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "The virtual try-on is temporarily unavailable.",
      code: "provider_unavailable",
    });
  });

  it("returns 502 provider_error without forwarding the provider message (scenario 4)", async () => {
    providerFailing(
      new TryOnProviderError("The try-on provider returned an error (HTTP 500).", {
        kind: "provider",
        status: 500,
      }),
    );

    const response = await POST(formRequest());

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("provider_error");
    expect(body.error).toBe("The try-on couldn't be completed right now. Please try again.");
    expect(body.error).not.toContain("HTTP 500");
  });

  it("returns 502 provider_error for an unexpected thrown error without leaking it", async () => {
    providerFailing(new Error("unexpected provider internals"));

    const response = await POST(formRequest());

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("provider_error");
    expect(body.error).not.toContain("internals");
  });

  it("swapping the provider implementation changes no route code (scenario 4)", async () => {
    // A different implementation behind the same port: the image is returned
    // unchanged, proving the seam is the port and not the provider.
    getProviderMock.mockReturnValue({
      generateTryOn: vi.fn<TryOnProvider["generateTryOn"]>(async () => ({
        image: { kind: "url" as const, url: "https://provider.example/result.png" },
      })),
    });

    const response = await POST(formRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      image: { kind: "url", url: "https://provider.example/result.png" },
    });
  });
});
