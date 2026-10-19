// Shared photo validation for virtual try-on. Framework-agnostic and pure: the
// panel uses it as a convenience preflight and the route uses it as the
// security boundary before any catalog lookup or provider call.
//
// Privacy: only the declared size/type and the first bytes of the photo are
// inspected. Nothing here reads, copies, stores or logs the image itself.

/** Maximum accepted photo size: 4 MiB (a byte over is rejected). */
export const MAX_TRY_ON_PHOTO_BYTES = 4 * 1024 * 1024;

/** Accepted photo MIME types, in the order the UI advertises them. */
export const TRY_ON_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type TryOnPhotoMimeType = (typeof TRY_ON_PHOTO_MIME_TYPES)[number];

/** Why a photo was rejected. */
export type TryOnPhotoIssue = "empty" | "unsupported_type" | "too_large" | "not_an_image";

export type TryOnPhotoValidation =
  | { ok: true }
  | { ok: false; issue: TryOnPhotoIssue; message: string };

/** Fixed, shopper-facing messages. Never include file names or file contents. */
export const TRY_ON_PHOTO_MESSAGES = {
  empty: "Choose a photo to try on.",
  unsupported_type: "Choose a JPG, PNG or WebP photo.",
  too_large: "Choose a photo smaller than 4 MB.",
  not_an_image: "That file doesn't look like a JPG, PNG or WebP photo. Choose another image.",
} as const satisfies Record<TryOnPhotoIssue, string>;

/** Idle hint shown next to the file input. */
export const TRY_ON_PHOTO_HINT = "Choose a JPG, PNG or WebP photo up to 4 MB.";

function isAllowedMimeType(type: string): type is TryOnPhotoMimeType {
  return (TRY_ON_PHOTO_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Validates a chosen photo by declared size and MIME type only (no I/O).
 * Checks run in a fixed order: empty, MIME allowlist, then the 4 MiB cap.
 * Exactly {@link MAX_TRY_ON_PHOTO_BYTES} passes (inclusive boundary).
 */
export function validateTryOnPhoto(file: { size: number; type: string }): TryOnPhotoValidation {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, issue: "empty", message: TRY_ON_PHOTO_MESSAGES.empty };
  }
  if (!isAllowedMimeType(file.type)) {
    return {
      ok: false,
      issue: "unsupported_type",
      message: TRY_ON_PHOTO_MESSAGES.unsupported_type,
    };
  }
  if (file.size > MAX_TRY_ON_PHOTO_BYTES) {
    return { ok: false, issue: "too_large", message: TRY_ON_PHOTO_MESSAGES.too_large };
  }
  return { ok: true };
}

/**
 * Sniffs the image format from the leading magic bytes. Recognises the same
 * PNG, JPEG and WebP signatures the provider adapter recognises; anything else
 * (including a spoofed `.png` text file) returns undefined.
 */
export function sniffImageMimeType(bytes: Uint8Array): TryOnPhotoMimeType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return undefined;
}
