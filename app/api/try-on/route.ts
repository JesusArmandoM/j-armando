import { getDb } from "@/db/client.ts";
import { getTryOnGarmentContext } from "@/db/catalog.ts";
import { variantSize } from "@/db/schema/index.ts";
import type { VariantSize } from "@/db/schema/index.ts";
import { getTryOnProvider } from "@/lib/try-on/index.ts";
import {
  TRY_ON_PHOTO_MESSAGES,
  sniffImageMimeType,
  validateTryOnPhoto,
} from "@/lib/try-on/photo-validation.ts";
import { buildTryOnPrompt } from "@/lib/try-on/prompt.ts";
import { TryOnProviderError } from "@/lib/try-on/try-on-provider.ts";

// The only server seam the try-on panel knows. It receives the photo plus
// garment context as multipart/form-data and returns `{ image }`; it never
// reveals which provider is configured. Failures return a stable `{ error, code }`
// pair so the panel can show its own fixed copy.
//
// Privacy (interim until consent/retention decision #3): the photo lives in
// memory for this request only. The route never writes to disk, the database,
// object storage or a cache, and never logs image bytes, base64, data URLs or
// provider URLs. The response is explicitly non-cacheable.
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

const VALID_SIZES = new Set<string>(variantSize.enumValues);

/** Stable failure codes shared with the panel's copy mapper. */
export type TryOnErrorCode =
  | "invalid_request"
  | "invalid_photo"
  | "not_available"
  | "consent_required"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_error";

const DEFAULT_MESSAGES: Record<TryOnErrorCode, string> = {
  invalid_request: "The request could not be completed.",
  invalid_photo: `Choose a JPG, PNG or WebP photo smaller than 4 MB.`,
  not_available: "This garment is not available for try-on.",
  consent_required: "Please acknowledge the photo notice before trying on.",
  provider_unavailable: "The virtual try-on is temporarily unavailable.",
  provider_timeout: "The try-on took too long to finish. Please try again.",
  provider_error: "The try-on couldn't be completed right now. Please try again.",
};

function fail(status: number, code: TryOnErrorCode, message?: string): Response {
  return Response.json(
    { error: message ?? DEFAULT_MESSAGES[code], code },
    { status, headers: NO_STORE },
  );
}

/** Returns a non-empty trimmed string field, or undefined. */
function stringField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid_request", "Request body must be multipart/form-data.");
  }

  const photo = form.get("photo");
  const productSlug = stringField(form, "productSlug");
  const size = stringField(form, "size");
  const color = stringField(form, "color");
  const consent = stringField(form, "consent");

  // Photo validation comes first: unsupported or oversized bytes must never
  // reach the catalog or the provider.
  if (!(photo instanceof File)) {
    return fail(400, "invalid_photo", TRY_ON_PHOTO_MESSAGES.empty);
  }
  const declared = validateTryOnPhoto({ size: photo.size, type: photo.type });
  if (!declared.ok) {
    return fail(400, "invalid_photo", declared.message);
  }

  // Read the bytes exactly once and reuse them for the provider call. The
  // signature check makes the client-side MIME check a convenience, not the
  // security boundary.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await photo.arrayBuffer());
  } catch {
    return fail(400, "invalid_photo", TRY_ON_PHOTO_MESSAGES.not_an_image);
  }
  if (!sniffImageMimeType(bytes)) {
    return fail(400, "invalid_photo", TRY_ON_PHOTO_MESSAGES.not_an_image);
  }

  if (!productSlug || !size || !color) {
    return fail(400, "invalid_request", "Product, size and color are required.");
  }
  if (!VALID_SIZES.has(size)) {
    return fail(400, "not_available");
  }
  if (consent !== "accepted") {
    return fail(400, "consent_required");
  }

  let garment;
  try {
    garment = await getTryOnGarmentContext(getDb(), productSlug, size as VariantSize, color);
  } catch {
    console.error("Try-on garment lookup failed.");
    return fail(503, "provider_unavailable");
  }

  if (!garment) {
    return fail(400, "not_available");
  }

  const prompt = buildTryOnPrompt({
    productName: garment.name,
    color: garment.color,
    size: garment.size,
    composition: garment.composition,
  });

  try {
    const result = await getTryOnProvider().generateTryOn({
      photo: {
        bytes,
        mimeType: photo.type,
        filename: photo.name || "photo",
      },
      prompt,
    });

    return Response.json({ image: result.image }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof TryOnProviderError) {
      // Fixed diagnostic only: never the photo, prompt payload or provider body.
      console.error("Try-on generation failed.", {
        name: error.name,
        kind: error.kind,
        status: error.status,
      });

      if (error.kind === "timeout") return fail(504, "provider_timeout");
      if (error.kind === "configuration") return fail(503, "provider_unavailable");
      return fail(502, "provider_error");
    }
    console.error("Try-on generation failed with an unexpected error.");
    return fail(502, "provider_error");
  }
}
