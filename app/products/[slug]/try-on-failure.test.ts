import { describe, expect, it } from "vitest";

import { TRY_ON_FAILURE_MESSAGES, failureCopyFor } from "./try-on-failure.ts";

describe("failureCopyFor", () => {
  it("maps invalid_photo to format/size guidance and disables retry", () => {
    expect(failureCopyFor(400, "invalid_photo")).toEqual({
      message: TRY_ON_FAILURE_MESSAGES.invalid_photo,
      retryable: false,
    });
    expect(failureCopyFor(400, "invalid_photo").message).toContain("JPG, PNG or WebP");
    expect(failureCopyFor(400, "invalid_photo").message).toContain("4 MB");
  });

  it("maps provider_timeout to timeout-specific copy and allows retry", () => {
    expect(failureCopyFor(504, "provider_timeout")).toEqual({
      message: "The try-on took too long to finish. Please try again.",
      retryable: true,
    });
  });

  it("maps other 4xx failures to check-the-photo copy", () => {
    for (const status of [400, 404, 409, 413, 422]) {
      expect(failureCopyFor(status, "invalid_request")).toEqual({
        message: TRY_ON_FAILURE_MESSAGES.invalid_request,
        retryable: true,
      });
    }
    expect(failureCopyFor(400, undefined)).toEqual({
      message: TRY_ON_FAILURE_MESSAGES.invalid_request,
      retryable: true,
    });
  });

  it("maps 502/503 and network failures (status 0) to right-now copy and allows retry", () => {
    for (const [status, code] of [
      [502, "provider_error"],
      [503, "provider_unavailable"],
      [0, undefined],
      [0, "network_error"],
      [NaN, undefined],
    ] as const) {
      expect(failureCopyFor(status, code)).toEqual({
        message: TRY_ON_FAILURE_MESSAGES.unavailable,
        retryable: true,
      });
    }
  });
});
