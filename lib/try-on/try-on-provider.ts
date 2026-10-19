// TryOnProvider port: the storefront's virtual try-on capability expressed as a
// narrow, framework-agnostic interface. Concrete image providers (the DevExpert
// gateway / OpenAI-compatible images API today) are adapters behind this port,
// so the route handler and the product-page panel never depend on a provider.
// See ARCHITECTURE.md → Layering Intent and CONSTRAINTS.md → AI providers.
//
// Privacy: photos and results travel through this interface in memory only.
// Nothing in this module (or any adapter) may persist, cache or log image bytes.

/** The shopper's uploaded photo, held in memory for the current request. */
export interface TryOnPhoto {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}

/** One try-on generation request: the photo plus a server-built prompt. */
export interface TryOnRequest {
  photo: TryOnPhoto;
  prompt: string;
}

/**
 * A generated try-on image. `base64` is preferred; `url` is a provider-hosted
 * URL handed to the browser as-is (the server never downloads or stores it).
 */
export type TryOnImage =
  | { kind: "base64"; base64: string; mimeType: string }
  | { kind: "url"; url: string };

/** The result of a successful generation. */
export interface TryOnResult {
  image: TryOnImage;
}

/** The virtual try-on capability the application depends on. */
export interface TryOnProvider {
  generateTryOn(request: TryOnRequest): Promise<TryOnResult>;
}

/**
 * Error kinds a caller can react to. `configuration` means the adapter is not
 * usable yet (missing base URL, model or key) and maps to HTTP 503; `provider`
 * means the upstream provider failed or returned something unusable and maps
 * to HTTP 502.
 */
export type TryOnProviderErrorKind = "configuration" | "provider";

/**
 * Typed error surfaced by every {@link TryOnProvider} adapter. Messages are
 * fixed and generic: they must never contain photo bytes, base64, data URLs,
 * provider URLs or provider response bodies.
 */
export class TryOnProviderError extends Error {
  readonly kind: TryOnProviderErrorKind;
  /** Upstream HTTP status, when the failure came from a provider response. */
  readonly status?: number;

  constructor(
    message: string,
    options: { kind?: TryOnProviderErrorKind; status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TryOnProviderError";
    this.kind = options.kind ?? "provider";
    this.status = options.status;
  }
}
