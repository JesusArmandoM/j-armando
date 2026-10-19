import { describe, expect, it } from "vitest";

import {
  MAX_TRY_ON_PHOTO_BYTES,
  TRY_ON_PHOTO_HINT,
  TRY_ON_PHOTO_MESSAGES,
  TRY_ON_PHOTO_MIME_TYPES,
  sniffImageMimeType,
  validateTryOnPhoto,
} from "./photo-validation.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
]);

describe("TRY_ON_PHOTO_MIME_TYPES", () => {
  it("accepts exactly JPEG, PNG and WebP", () => {
    expect([...TRY_ON_PHOTO_MIME_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("validateTryOnPhoto", () => {
  it("rejects an empty file with a 'choose a photo' message", () => {
    expect(validateTryOnPhoto({ size: 0, type: "image/png" })).toEqual({
      ok: false,
      issue: "empty",
      message: TRY_ON_PHOTO_MESSAGES.empty,
    });
  });

  it("rejects unsupported and missing MIME types before the size check", () => {
    for (const type of ["text/plain", "image/gif", "image/heic", "image/avif", ""]) {
      expect(validateTryOnPhoto({ size: 1024, type })).toEqual({
        ok: false,
        issue: "unsupported_type",
        message: TRY_ON_PHOTO_MESSAGES.unsupported_type,
      });
    }
    // Unsupported type wins even when the file is also too large.
    expect(validateTryOnPhoto({ size: MAX_TRY_ON_PHOTO_BYTES + 1, type: "image/gif" })).toMatchObject({
      issue: "unsupported_type",
    });
  });

  it("accepts exactly 4 MiB (inclusive boundary) for every allowed type", () => {
    for (const type of TRY_ON_PHOTO_MIME_TYPES) {
      expect(validateTryOnPhoto({ size: MAX_TRY_ON_PHOTO_BYTES, type })).toEqual({ ok: true });
    }
  });

  it("rejects one byte over 4 MiB with the size-limit message", () => {
    expect(validateTryOnPhoto({ size: MAX_TRY_ON_PHOTO_BYTES + 1, type: "image/jpeg" })).toEqual({
      ok: false,
      issue: "too_large",
      message: TRY_ON_PHOTO_MESSAGES.too_large,
    });
    expect(TRY_ON_PHOTO_MESSAGES.too_large).toContain("smaller than 4 MB");

    const hint = TRY_ON_PHOTO_HINT;
    expect(hint).toContain("JPG, PNG or WebP");
    expect(hint).toContain("4 MB");
  });
});

describe("sniffImageMimeType", () => {
  it("recognises PNG, JPEG and WebP magic bytes", () => {
    expect(sniffImageMimeType(PNG)).toBe("image/png");
    expect(sniffImageMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffImageMimeType(WEBP)).toBe("image/webp");
  });

  it("rejects a spoofed text file, truncated headers and empty input", () => {
    const text = new TextEncoder().encode("this is not an image");
    expect(sniffImageMimeType(text)).toBeUndefined();
    expect(sniffImageMimeType(new TextEncoder().encode("<svg xmlns='...'>"))).toBeUndefined();
    expect(sniffImageMimeType(PNG.slice(0, 4))).toBeUndefined();
    expect(sniffImageMimeType(new Uint8Array())).toBeUndefined();
  });

  it("does not accept a RIFF container that is not WebP", () => {
    const wave = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageMimeType(wave)).toBeUndefined();
  });
});
