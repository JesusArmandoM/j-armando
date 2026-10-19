// Fixed shopper-facing copy for a failed try-on attempt. Pure and framework
// agnostic: the panel calls it with the HTTP status and the route's stable code
// and never renders server- or provider-supplied text.

export interface TryOnFailureCopy {
  message: string;
  /** Whether the shopper can retry with the photo already chosen. */
  retryable: boolean;
}

export const TRY_ON_FAILURE_MESSAGES = {
  invalid_photo: "Choose a JPG, PNG or WebP photo smaller than 4 MB.",
  timeout: "The try-on took too long to finish. Please try again.",
  invalid_request: "The try-on couldn't be completed. Please check your photo and try again.",
  unavailable:
    "The try-on couldn't be completed right now. Please try again.",
} as const;

/**
 * Maps a failed `POST /api/try-on` response to stable panel copy.
 *
 * - `invalid_photo` → format/size guidance, not retryable (the selection is cleared).
 * - `provider_timeout` → timeout copy, retryable.
 * - any other 4xx → check-the-photo copy, retryable after adjusting the selection.
 * - 502/503 or a network failure (status 0) → right-now copy, retryable.
 */
export function failureCopyFor(status: number, code?: string): TryOnFailureCopy {
  if (code === "invalid_photo") {
    return { message: TRY_ON_FAILURE_MESSAGES.invalid_photo, retryable: false };
  }
  if (code === "provider_timeout") {
    return { message: TRY_ON_FAILURE_MESSAGES.timeout, retryable: true };
  }
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return { message: TRY_ON_FAILURE_MESSAGES.invalid_request, retryable: true };
  }
  return { message: TRY_ON_FAILURE_MESSAGES.unavailable, retryable: true };
}
