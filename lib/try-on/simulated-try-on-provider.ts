import { TryOnProviderError } from "./try-on-provider.ts";
import type { TryOnProvider, TryOnResult } from "./try-on-provider.ts";

// Deterministic in-process adapter. No network, no env, no filesystem. Used by
// route/UI tests and available for local demos; it is not the production
// default (the env factory selects the real adapter).

/** A 1×1 transparent PNG, used as the deterministic simulated result. */
export const SIMULATED_TRY_ON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface SimulatedTryOnProviderOptions {
  /** When true, every call throws a typed provider error (for failure tests). */
  fail?: boolean;
}

/** Creates the deterministic simulated try-on provider. */
export function createSimulatedTryOnProvider(
  options: SimulatedTryOnProviderOptions = {},
): TryOnProvider {
  const { fail = false } = options;

  return {
    async generateTryOn(): Promise<TryOnResult> {
      if (fail) {
        throw new TryOnProviderError("The simulated try-on provider failed.", {
          kind: "provider",
          status: 500,
        });
      }
      return {
        image: {
          kind: "base64",
          base64: SIMULATED_TRY_ON_PNG_BASE64,
          mimeType: "image/png",
        },
      };
    },
  };
}
