"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AdminCategoryOption } from "@/db/admin-products.ts";
import type { VariantSize } from "@/db/schema/index.ts";
import {
  VALID_VARIANT_SIZES,
  validateAdminProductInput,
} from "../product-input.ts";

interface VariantRowState {
  key: number;
  size: VariantSize;
  color: string;
  colorHex: string;
  stockQty: string;
}

interface CreateProductFormProps {
  categories: AdminCategoryOption[];
}

export function CreateProductForm({ categories }: CreateProductFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [basePriceDollars, setBasePriceDollars] = useState("");
  const [description, setDescription] = useState("");
  const [composition, setComposition] = useState("");
  const [care, setCare] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [variants, setVariants] = useState<VariantRowState[]>([
    {
      key: 1,
      size: "M",
      color: "",
      colorHex: "#121212",
      stockQty: "0",
    },
  ]);
  const [nextVariantKey, setNextVariantKey] = useState(2);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleAddVariant() {
    setVariants((prev) => [
      ...prev,
      {
        key: nextVariantKey,
        size: "M",
        color: "",
        colorHex: "#121212",
        stockQty: "0",
      },
    ]);
    setNextVariantKey((k) => k + 1);
  }

  function handleRemoveVariant(keyToRemove: number) {
    setVariants((prev) => prev.filter((row) => row.key !== keyToRemove));
  }

  function handleVariantChange(
    key: number,
    field: keyof Omit<VariantRowState, "key">,
    value: string,
  ) {
    setVariants((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorBanner(null);
    setFieldErrors({});

    const rawPayload = {
      name,
      categoryId,
      basePriceDollars,
      description,
      composition,
      care,
      imageUrl: imageUrl.trim() || undefined,
      variants: variants.map((v) => ({
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        stockQty: v.stockQty,
      })),
    };

    const clientCheck = validateAdminProductInput(rawPayload);
    if (!clientCheck.ok) {
      setErrorBanner(clientCheck.error);
      setFieldErrors(clientCheck.fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rawPayload),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        fieldErrors?: Record<string, string>;
        product?: { id: string };
      };

      if (!response.ok || !data.ok || !data.product) {
        setErrorBanner(data.error ?? "Unable to create product.");
        setFieldErrors(data.fieldErrors ?? {});
        setIsSubmitting(false);
        return;
      }

      router.push(`/admin/products/${data.product.id}`);
      router.refresh();
    } catch {
      setErrorBanner("Network error while saving the product. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="admin-products-form"
      data-testid="create-product-form"
      noValidate
    >
      {errorBanner && (
        <div
          className="admin-products-alert"
          role="alert"
          data-testid="create-product-error"
        >
          {errorBanner}
        </div>
      )}

      <section className="admin-products-panel">
        <h2 className="admin-products-panel__title">Core Garment Details</h2>

        <div className="admin-products-grid">
          <div className="admin-products-field">
            <label htmlFor="product-name" className="admin-products-label">
              Product Name *
            </label>
            <input
              id="product-name"
              name="name"
              type="text"
              className="admin-products-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tailored Double-Breasted Wool Coat"
              required
            />
            {fieldErrors.name && (
              <p className="admin-products-field-error">{fieldErrors.name}</p>
            )}
          </div>

          <div className="admin-products-field">
            <label htmlFor="product-category" className="admin-products-label">
              Category *
            </label>
            <select
              id="product-category"
              name="categoryId"
              className="admin-products-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && (
              <p className="admin-products-field-error">{fieldErrors.categoryId}</p>
            )}
          </div>

          <div className="admin-products-field">
            <label htmlFor="product-price" className="admin-products-label">
              Base Price (USD, tax-exclusive) *
            </label>
            <input
              id="product-price"
              name="basePriceDollars"
              type="text"
              inputMode="decimal"
              className="admin-products-input"
              value={basePriceDollars}
              onChange={(e) => setBasePriceDollars(e.target.value)}
              placeholder="e.g. 249.00"
              required
            />
            {fieldErrors.basePrice && (
              <p className="admin-products-field-error">{fieldErrors.basePrice}</p>
            )}
          </div>

          <div className="admin-products-field">
            <label htmlFor="product-image-url" className="admin-products-label">
              Primary Image URL (optional)
            </label>
            <input
              id="product-image-url"
              name="imageUrl"
              type="text"
              className="admin-products-input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="e.g. /images/products/longline-wool-overcoat-1.svg"
            />
            {fieldErrors.imageUrl && (
              <p className="admin-products-field-error">{fieldErrors.imageUrl}</p>
            )}
          </div>
        </div>

        <div className="admin-products-field">
          <label htmlFor="product-description" className="admin-products-label">
            Editorial Description *
          </label>
          <textarea
            id="product-description"
            name="description"
            rows={3}
            className="admin-products-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe silhouette, drape, and construction details."
            required
          />
          {fieldErrors.description && (
            <p className="admin-products-field-error">{fieldErrors.description}</p>
          )}
        </div>

        <div className="admin-products-grid">
          <div className="admin-products-field">
            <label htmlFor="product-composition" className="admin-products-label">
              Composition / Material *
            </label>
            <input
              id="product-composition"
              name="composition"
              type="text"
              className="admin-products-input"
              value={composition}
              onChange={(e) => setComposition(e.target.value)}
              placeholder="e.g. 100% Virgin Wool; Lining: 100% Cupro"
              required
            />
            {fieldErrors.composition && (
              <p className="admin-products-field-error">{fieldErrors.composition}</p>
            )}
          </div>

          <div className="admin-products-field">
            <label htmlFor="product-care" className="admin-products-label">
              Care Instructions *
            </label>
            <input
              id="product-care"
              name="care"
              type="text"
              className="admin-products-input"
              value={care}
              onChange={(e) => setCare(e.target.value)}
              placeholder="e.g. Specialist dry clean only. Do not tumble dry."
              required
            />
            {fieldErrors.care && (
              <p className="admin-products-field-error">{fieldErrors.care}</p>
            )}
          </div>
        </div>
      </section>

      <section className="admin-products-panel" data-testid="variants-section">
        <div className="admin-products-panel__header">
          <div>
            <h2 className="admin-products-panel__title">Variants & Per-Variant Stock</h2>
            <p className="admin-products-panel__hint">
              Stock is tracked strictly per size and color variant.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddVariant}
            className="admin-btn admin-btn--secondary"
            data-testid="add-variant-btn"
          >
            + Add Variant
          </button>
        </div>

        {fieldErrors.variants && (
          <p className="admin-products-field-error">{fieldErrors.variants}</p>
        )}

        <div className="admin-products-variants-list">
          {variants.map((row, index) => (
            <div
              key={row.key}
              className="admin-products-variant-row"
              data-testid={`variant-row-${index}`}
            >
              <div className="admin-products-field">
                <label
                  htmlFor={`variant-size-${index}`}
                  className="admin-products-label"
                >
                  Size *
                </label>
                <select
                  id={`variant-size-${index}`}
                  aria-label={`Variant ${index + 1} Size`}
                  className="admin-products-select"
                  value={row.size}
                  onChange={(e) =>
                    handleVariantChange(
                      row.key,
                      "size",
                      e.target.value as VariantSize,
                    )
                  }
                >
                  {VALID_VARIANT_SIZES.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
                {fieldErrors[`variants.${index}.size`] && (
                  <p className="admin-products-field-error">
                    {fieldErrors[`variants.${index}.size`]}
                  </p>
                )}
              </div>

              <div className="admin-products-field">
                <label
                  htmlFor={`variant-color-${index}`}
                  className="admin-products-label"
                >
                  Color *
                </label>
                <input
                  id={`variant-color-${index}`}
                  aria-label={`Variant ${index + 1} Color`}
                  type="text"
                  className="admin-products-input"
                  value={row.color}
                  onChange={(e) =>
                    handleVariantChange(row.key, "color", e.target.value)
                  }
                  placeholder="e.g. Obsidian Black"
                  required
                />
                {fieldErrors[`variants.${index}.color`] && (
                  <p className="admin-products-field-error">
                    {fieldErrors[`variants.${index}.color`]}
                  </p>
                )}
              </div>

              <div className="admin-products-field">
                <label
                  htmlFor={`variant-hex-${index}`}
                  className="admin-products-label"
                >
                  Swatch Hex
                </label>
                <input
                  id={`variant-hex-${index}`}
                  aria-label={`Variant ${index + 1} Color Hex`}
                  type="text"
                  className="admin-products-input"
                  value={row.colorHex}
                  onChange={(e) =>
                    handleVariantChange(row.key, "colorHex", e.target.value)
                  }
                  placeholder="#121212"
                />
                {fieldErrors[`variants.${index}.colorHex`] && (
                  <p className="admin-products-field-error">
                    {fieldErrors[`variants.${index}.colorHex`]}
                  </p>
                )}
              </div>

              <div className="admin-products-field">
                <label
                  htmlFor={`variant-stock-${index}`}
                  className="admin-products-label"
                >
                  Stock Qty *
                </label>
                <input
                  id={`variant-stock-${index}`}
                  aria-label={`Variant ${index + 1} Stock`}
                  type="number"
                  min={0}
                  step={1}
                  className="admin-products-input"
                  value={row.stockQty}
                  onChange={(e) =>
                    handleVariantChange(row.key, "stockQty", e.target.value)
                  }
                  required
                />
                {fieldErrors[`variants.${index}.stockQty`] && (
                  <p className="admin-products-field-error">
                    {fieldErrors[`variants.${index}.stockQty`]}
                  </p>
                )}
              </div>

              <div className="admin-products-variant-actions">
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(row.key)}
                    className="admin-products-remove-btn"
                    data-testid={`remove-variant-${index}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="admin-products-form-footer">
        <Link href="/admin/products" className="admin-btn admin-btn--secondary">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="admin-btn admin-btn--primary"
          data-testid="submit-product-btn"
        >
          {isSubmitting ? "Creating Product..." : "Create Draft Product"}
        </button>
      </div>
    </form>
  );
}
