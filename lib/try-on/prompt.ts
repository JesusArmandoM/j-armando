// Pure prompt builder for virtual try-on. Client input never becomes a
// free-form prompt: the route builds it from catalog data (product name,
// selected color/size and composition) and the model is told to preserve the
// shopper's identity.

export interface TryOnPromptInput {
  productName: string;
  color: string;
  size: string;
  composition: string;
}

/**
 * Builds the image-edit prompt for one garment context. Deterministic and
 * side-effect free so it can be unit-tested without a provider.
 */
export function buildTryOnPrompt({
  productName,
  color,
  size,
  composition,
}: TryOnPromptInput): string {
  return [
    `Create a photorealistic virtual try-on image of the person in the uploaded photo wearing the ${productName} in ${color}, size ${size}.`,
    `Garment composition: ${composition}.`,
    "Dress the person in exactly this garment and color at the stated size, and preserve their identity, face, hair, skin tone and body proportions.",
    "Keep a natural full-body studio composition with soft, even lighting on a plain warm ivory background.",
    "Do not add text, logos, watermarks, borders, extra garments or other people.",
  ].join(" ");
}
