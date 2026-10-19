import { describe, expect, it, vi } from "vitest";

import {
  SIMULATED_TRY_ON_PNG_BASE64,
  createSimulatedTryOnProvider,
} from "./simulated-try-on-provider.ts";
import type { TryOnPhoto } from "./try-on-provider.ts";

const photo: TryOnPhoto = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png",
  filename: "photo.png",
};

describe("createSimulatedTryOnProvider", () => {
  it("returns a deterministic PNG result without network or env", async () => {
    const provider = createSimulatedTryOnProvider();

    const first = await provider.generateTryOn({ photo, prompt: "prompt" });
    const second = await provider.generateTryOn({ photo, prompt: "prompt" });

    expect(first).toEqual({
      image: {
        kind: "base64",
        base64: SIMULATED_TRY_ON_PNG_BASE64,
        mimeType: "image/png",
      },
    });
    expect(second).toEqual(first);
    // A valid 1×1 PNG signature, so the browser can render it.
    expect(first.image).toMatchObject({ kind: "base64" });
    const decoded = Buffer.from(SIMULATED_TRY_ON_PNG_BASE64, "base64");
    expect([...decoded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("throws a typed provider error on demand", async () => {
    const provider = createSimulatedTryOnProvider({ fail: true });

    await expect(provider.generateTryOn({ photo, prompt: "prompt" })).rejects.toMatchObject({
      name: "TryOnProviderError",
      kind: "provider",
      status: 500,
    });
  });

  it("honours the port without touching fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await createSimulatedTryOnProvider().generateTryOn({ photo, prompt: "prompt" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
