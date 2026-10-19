import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnProvider } from "./try-on-provider.ts";

vi.mock("./openai-images-try-on-provider.ts", () => ({
  createOpenAiImagesTryOnProvider: vi.fn(() => ({ generateTryOn: vi.fn() })),
}));

import { createOpenAiImagesTryOnProvider } from "./openai-images-try-on-provider.ts";
import { getTryOnProvider, resetTryOnProvider } from "./index.ts";

const createAdapterMock = vi.mocked(createOpenAiImagesTryOnProvider);

const savedEnv = {
  TRYON_BASE_URL: process.env.TRYON_BASE_URL,
  TRYON_MODEL: process.env.TRYON_MODEL,
  TRYON_API_KEY: process.env.TRYON_API_KEY,
  DEVEXPERT_API_KEY: process.env.DEVEXPERT_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function restoreEnv() {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

beforeEach(() => {
  resetTryOnProvider();
  createAdapterMock.mockClear();
  delete process.env.TRYON_BASE_URL;
  delete process.env.TRYON_MODEL;
  delete process.env.TRYON_API_KEY;
  delete process.env.DEVEXPERT_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  resetTryOnProvider();
  restoreEnv();
});

describe("getTryOnProvider", () => {
  it("throws a configuration error when the variables are missing (no build-time read)", () => {
    expect(() => getTryOnProvider()).toThrow(TryOnProviderError);
    try {
      getTryOnProvider();
    } catch (error) {
      expect(error).toMatchObject({ name: "TryOnProviderError", kind: "configuration" });
    }
    expect(createAdapterMock).not.toHaveBeenCalled();
  });

  it("builds the adapter from TRYON_BASE_URL, TRYON_MODEL and TRYON_API_KEY", () => {
    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.TRYON_API_KEY = "tryon-key";
    process.env.DEVEXPERT_API_KEY = "devexpert-key";

    getTryOnProvider();

    expect(createAdapterMock).toHaveBeenCalledWith({
      apiKey: "tryon-key",
      baseUrl: "https://inference.devexpert.io/v1",
      model: "image-edit",
    });
  });

  it("falls back to DEVEXPERT_API_KEY when TRYON_API_KEY is absent", () => {
    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.DEVEXPERT_API_KEY = "devexpert-key";

    getTryOnProvider();

    expect(createAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "devexpert-key" }),
    );
  });

  it("falls back to OPENAI_API_KEY last", () => {
    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.OPENAI_API_KEY = "openai-key";

    getTryOnProvider();

    expect(createAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "openai-key" }),
    );
  });

  it("caches the instance and resetTryOnProvider clears it", () => {
    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.TRYON_API_KEY = "key";

    const first = getTryOnProvider();
    const second = getTryOnProvider();
    expect(second).toBe(first);
    expect(createAdapterMock).toHaveBeenCalledTimes(1);

    resetTryOnProvider();
    const third = getTryOnProvider();
    expect(third).not.toBe(first);
    expect(createAdapterMock).toHaveBeenCalledTimes(2);
  });

  it("reads configuration lazily, at call time", () => {
    expect(() => getTryOnProvider()).toThrow(TryOnProviderError);

    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.TRYON_API_KEY = "key";

    expect(getTryOnProvider()).toBeDefined();
  });

  it("implements the port interface without provider-specific imports", () => {
    process.env.TRYON_BASE_URL = "https://inference.devexpert.io/v1";
    process.env.TRYON_MODEL = "image-edit";
    process.env.TRYON_API_KEY = "key";
    const provider: TryOnProvider = getTryOnProvider();
    expect(typeof provider.generateTryOn).toBe("function");
  });
});
