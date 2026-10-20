"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ProductStatus } from "@/db/schema/index.ts";

interface ProductStatusActionsProps {
  productId: string;
  initialStatus: ProductStatus;
  productSlug: string;
}

export function ProductStatusActions({
  productId,
  initialStatus,
  productSlug,
}: ProductStatusActionsProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<ProductStatus>(initialStatus);
  const [loadingTarget, setLoadingTarget] = useState<ProductStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleTransition(targetStatus: ProductStatus) {
    if (loadingTarget !== null || targetStatus === currentStatus) {
      return;
    }

    setLoadingTarget(targetStatus);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${productId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setErrorMessage(
          data?.error ?? `Failed to change status to ${targetStatus}.`,
        );
        return;
      }

      const nextStatus = data.product?.status as ProductStatus;
      setCurrentStatus(nextStatus);
      setSuccessMessage(`Product status updated to ${nextStatus}.`);

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage("Network error while updating product status.");
    } finally {
      setLoadingTarget(null);
    }
  }

  const isPending = loadingTarget !== null;

  return (
    <div
      className="admin-product-publish-actions"
      data-testid="product-status-actions"
      data-current-status={currentStatus}
    >
      <div className="admin-product-publish-actions__buttons">
        {currentStatus === "draft" && (
          <>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--publish"
              data-testid="publish-product-btn"
              disabled={isPending}
              onClick={() => handleTransition("published")}
            >
              {loadingTarget === "published"
                ? "Publishing..."
                : "Publish Product"}
            </button>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--archive"
              data-testid="archive-product-btn"
              disabled={isPending}
              onClick={() => handleTransition("archived")}
            >
              {loadingTarget === "archived"
                ? "Archiving..."
                : "Archive Product"}
            </button>
          </>
        )}

        {currentStatus === "published" && (
          <>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--draft"
              data-testid="revert-draft-btn"
              disabled={isPending}
              onClick={() => handleTransition("draft")}
            >
              {loadingTarget === "draft"
                ? "Reverting..."
                : "Revert to Draft"}
            </button>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--archive"
              data-testid="archive-product-btn"
              disabled={isPending}
              onClick={() => handleTransition("archived")}
            >
              {loadingTarget === "archived"
                ? "Archiving..."
                : "Archive Product"}
            </button>
          </>
        )}

        {currentStatus === "archived" && (
          <>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--publish"
              data-testid="publish-product-btn"
              disabled={isPending}
              onClick={() => handleTransition("published")}
            >
              {loadingTarget === "published"
                ? "Publishing..."
                : "Publish Product"}
            </button>
            <button
              type="button"
              className="admin-btn admin-product-publish-btn admin-product-publish-btn--draft"
              data-testid="revert-draft-btn"
              disabled={isPending}
              onClick={() => handleTransition("draft")}
            >
              {loadingTarget === "draft"
                ? "Reverting..."
                : "Revert to Draft"}
            </button>
          </>
        )}
      </div>

      {successMessage && (
        <p
          className="admin-product-publish-feedback admin-product-publish-feedback--success"
          data-testid="status-action-success"
          role="status"
        >
          {successMessage}
        </p>
      )}

      {errorMessage && (
        <p
          className="admin-product-publish-feedback admin-product-publish-feedback--error"
          data-testid="status-action-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      <p className="admin-product-publish-hint">
        {currentStatus === "published" ? (
          <>
            Visible in storefront at{" "}
            <a
              href={`/products/${productSlug}`}
              target="_blank"
              rel="noreferrer"
              className="admin-product-publish-link"
            >
              /products/{productSlug} &rarr;
            </a>
          </>
        ) : (
          <>Hidden from storefront catalog and product pages (returns 404).</>
        )}
      </p>
    </div>
  );
}
