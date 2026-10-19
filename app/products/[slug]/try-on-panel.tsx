"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type { VariantSize } from "@/db/schema/index.ts";
import { TRY_ON_PHOTO_HINT, validateTryOnPhoto } from "@/lib/try-on/photo-validation.ts";
import type { TryOnImage } from "@/lib/try-on/try-on-provider.ts";
import { failureCopyFor } from "./try-on-failure.ts";
import type { TryOnFailureCopy } from "./try-on-failure.ts";

// Try-on panel on the product detail page. The size/color picker here supplies
// **garment context only** for try-on — it is not the purchase variant and it
// never changes the page price, stock message or cart (owned by
// product-variant-selection). When that feature ships, its selected variant can
// be passed in and this local picker removed without touching the port or API.
//
// Privacy: the photo and result live only in this component's state for the
// current page session. Nothing is written to localStorage/IndexedDB or any
// server-side store; unmounting discards the result.

export interface TryOnPanelVariant {
  size: VariantSize;
  color: string;
  colorHex: string;
  stockQty: number;
}

interface TryOnPanelProps {
  productSlug: string;
  productName: string;
  variants: TryOnPanelVariant[];
}

interface TryOnSuccess {
  image: TryOnImage;
  color: string;
}

function imageSrc(image: TryOnImage): string {
  return image.kind === "base64"
    ? `data:${image.mimeType};base64,${image.base64}`
    : image.url;
}

export function TryOnPanel({ productSlug, productName, variants }: TryOnPanelProps) {
  const sizes = [...new Set(variants.map((variant) => variant.size))];
  const initialSize = sizes[0] ?? "";
  const initialColor = variants.find((variant) => variant.size === initialSize)?.color ?? "";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState(initialSize);
  const [color, setColor] = useState(initialColor);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TryOnSuccess | null>(null);
  const [failure, setFailure] = useState<TryOnFailureCopy | null>(null);

  if (variants.length === 0) {
    return (
      <section className="try-on" data-testid="try-on-panel" aria-labelledby="try-on-title">
        <h2 className="try-on__title" id="try-on-title">
          Virtual try-on
        </h2>
        <p className="try-on__unavailable" data-testid="try-on-unavailable">
          Virtual try-on is unavailable for this garment.
        </p>
      </section>
    );
  }

  const colorsForSize = variants.filter((variant) => variant.size === size);
  const canSubmit = file !== null && consent && !loading;

  function handleSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSize = event.target.value as VariantSize;
    setSize(nextSize);
    const firstColor = variants.find((variant) => variant.size === nextSize)?.color ?? "";
    setColor(firstColor);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setResult(null);

    if (!nextFile) {
      setFile(null);
      setFailure(null);
      return;
    }

    const validation = validateTryOnPhoto({ size: nextFile.size, type: nextFile.type });
    if (!validation.ok) {
      // Clear both React state and the native input so an invalid selection
      // cannot be submitted and the same file can be chosen again after fixing it.
      setFile(null);
      setFailure({ message: validation.message, retryable: false });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFile(nextFile);
    setFailure(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !consent || loading) return;

    const form = new FormData();
    form.append("photo", file);
    form.append("productSlug", productSlug);
    form.append("size", size);
    form.append("color", color);
    form.append("consent", "accepted");

    setLoading(true);
    setFailure(null);
    setResult(null);

    try {
      const response = await fetch("/api/try-on", { method: "POST", body: form });
      if (!response.ok) {
        let code: string | undefined;
        try {
          const body = (await response.json()) as { code?: unknown };
          if (typeof body?.code === "string") code = body.code;
        } catch {
          // An unreadable failure body still maps by status.
        }

        const copy = failureCopyFor(response.status, code);
        if (!copy.retryable) {
          // The server rejected the photo: clear it so the shopper must choose
          // a valid one instead of retrying the same bytes.
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
        setFailure(copy);
        return;
      }

      const data = (await response.json()) as { image?: TryOnImage };
      const image = data?.image;
      const valid =
        image &&
        ((image.kind === "base64" &&
          typeof image.base64 === "string" &&
          image.base64 !== "" &&
          typeof image.mimeType === "string") ||
          (image.kind === "url" && typeof image.url === "string" && image.url !== ""));

      if (!valid) {
        setFailure(failureCopyFor(response.status, "provider_error"));
        return;
      }

      // Keep only the current result, tied to the color that was generated.
      setResult({ image: image as TryOnImage, color });
    } catch {
      setFailure(failureCopyFor(0));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="try-on" data-testid="try-on-panel" aria-labelledby="try-on-title">
      <h2 className="try-on__title" id="try-on-title">
        Virtual try-on
      </h2>
      <p className="try-on__intro">
        Preview this piece on you. Choose the size and color you are considering.
      </p>

      <form className="try-on__form" onSubmit={handleSubmit}>
        <div className="try-on__fields">
          <div className="try-on__field">
            <label className="try-on__label" htmlFor="try-on-size">
              Size
            </label>
            <select
              className="try-on__select"
              id="try-on-size"
              value={size}
              onChange={handleSizeChange}
              disabled={loading}
            >
              {sizes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="try-on__field">
            <label className="try-on__label" htmlFor="try-on-color">
              Color
            </label>
            <select
              className="try-on__select"
              id="try-on-color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              disabled={loading}
            >
              {colorsForSize.map((variant) => (
                <option key={variant.color} value={variant.color}>
                  {variant.stockQty === 0
                    ? `${variant.color} — Out of stock`
                    : variant.color}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="try-on__field">
          <label className="try-on__label" htmlFor="try-on-photo">
            Your photo
          </label>
          <input
            className="try-on__file"
            id="try-on-photo"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={loading}
            aria-describedby="try-on-photo-hint"
          />
          <p className="try-on__hint" id="try-on-photo-hint" data-testid="try-on-hint">
            {TRY_ON_PHOTO_HINT}
          </p>
        </div>

        <label className="try-on__consent" htmlFor="try-on-consent">
          <input
            id="try-on-consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={loading}
          />
          <span>
            I understand this preview uses my photo for this request only and it is not
            saved.
          </span>
        </label>

        <button className="try-on__submit" type="submit" disabled={!canSubmit}>
          {failure?.retryable ? "Try again" : "Try on"}
        </button>
      </form>

      <div className="try-on__status" aria-live="polite">
        {loading && (
          <p className="try-on__loading" data-testid="try-on-loading">
            Generating your try-on&hellip;
          </p>
        )}
        {result && !loading && (
          <figure className="try-on__result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="try-on__image"
              src={imageSrc(result.image)}
              alt={`Virtual try-on of you wearing the ${productName} in ${result.color}`}
              data-testid="try-on-result"
            />
          </figure>
        )}
      </div>

      {failure && (
        <p className="try-on__error" role="alert" data-testid="try-on-error">
          {failure.message}
        </p>
      )}

      <p className="try-on__privacy" data-testid="try-on-privacy">
        Your photo is processed in memory for this preview only. We do not store it or the
        result.
      </p>
    </section>
  );
}
