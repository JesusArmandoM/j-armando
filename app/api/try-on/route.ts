import { getDb } from "@/db/client.ts";
import { getTryOnGarmentContext } from "@/db/catalog.ts";
import { variantSize } from "@/db/schema/index.ts";
import type { VariantSize } from "@/db/schema/index.ts";
import { getTryOnProvider } from "@/lib/try-on/index.ts";
import { buildTryOnPrompt } from "@/lib/try-on/prompt.ts";
import { TryOnProviderError } from "@/lib/try-on/try-on-provider.ts";

// The only server seam the try-on panel knows. It receives the photo plus
// garment context as multipart/form-data and returns `{ image }`; it never
// reveals which provider is configured.
//
// Privacy (interim until consent/retention decision #3): the photo lives in
// memory for this request only. The route never writes to disk, the database,
// object storage or a cache, and never logs image bytes, base64, data URLs or
// provider URLs. The response is explicitly non-cacheable.
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

const VALID_SIZES = new Set<string>(variantSize.enumValues);

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: NO_STORE });
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
    return badRequest("Request body must be multipart/form-data.");
  }

  const photo = form.get("photo");
  const productSlug = stringField(form, "productSlug");
  const size = stringField(form, "size");
  const color = stringField(form, "color");
  const consent = stringField(form, "consent");

  if (!(photo instanceof File) || photo.size === 0) {
    return badRequest("A photo is required.");
  }
  if (!productSlug || !size || !color) {
    return badRequest("Product, size and color are required.");
  }
  if (!VALID_SIZES.has(size)) {
    return badRequest("This garment is not available for try-on.");
  }
  if (consent !== "accepted") {
    return badRequest("Please acknowledge the photo notice before trying on.");
  }

  let garment;
  try {
    garment = await getTryOnGarmentContext(getDb(), productSlug, size as VariantSize, color);
  } catch {
    console.error("Try-on garment lookup failed.");
    return Response.json(
      { error: "The virtual try-on is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!garment) {
    return badRequest("This garment is not available for try-on.");
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
        bytes: new Uint8Array(await photo.arrayBuffer()),
        mimeType: photo.type || "application/octet-stream",
        filename: photo.name || "photo",
      },
      prompt,
    });

    return Response.json({ image: result.image }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof TryOnProviderError) {
      const status = error.kind === "configuration" ? 503 : 502;
      // Fixed diagnostic only: never the photo, prompt payload or provider body.
      console.error("Try-on generation failed.", {
        name: error.name,
        kind: error.kind,
        status: error.status,
      });
      return Response.json({ error: error.message }, { status, headers: NO_STORE });
    }
    console.error("Try-on generation failed with an unexpected error.");
    return Response.json(
      { error: "The virtual try-on is temporarily unavailable." },
      { status: 502, headers: NO_STORE },
    );
  }
}
