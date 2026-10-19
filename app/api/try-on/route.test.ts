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

const PHOTO_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

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

  it("returns 400 without consent and never calls the provider", async () => {
    const response = await POST(formRequest({ consent: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getProviderMock).not.toHaveBeenCalled();
    expect(catalogDb.getTryOnGarmentContext).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing photo, missing fields and an invalid size", async () => {
    const bodies = [
      formRequest({ photo: new File([], "empty.png", { type: "image/png" }) }),
      formRequest({ productSlug: "" }),
      formRequest({ color: "" }),
      formRequest({ size: "XXXL" }),
    ];

    for (const request of bodies) {
      const response = await POST(request);
      expect(response.status).toBe(400);
    }
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown, draft, archived or discontinued combination without a provider call", async () => {
    vi.mocked(catalogDb.getTryOnGarmentContext).mockResolvedValue(undefined);

    const response = await POST(formRequest({ productSlug: "cropped-tweed-jacket" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This garment is not available for try-on.",
    });
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the provider is not configured", async () => {
    getProviderMock.mockImplementation(() => {
      throw new TryOnProviderError("Virtual try-on is not configured.", {
        kind: "configuration",
      });
    });

    const response = await POST(formRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  it("returns 502 when the provider fails", async () => {
    getProviderMock.mockReturnValue({
      generateTryOn: vi.fn(async () => {
        throw new TryOnProviderError("The try-on provider returned an error (HTTP 500).", {
          kind: "provider",
          status: 500,
        });
      }),
    });

    const response = await POST(formRequest());

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toHaveProperty("error");
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
