import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTryOnGarmentContext, insertVariant, listVariantsByProductId } from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

// Integration coverage for the try-on garment-context read path
// (docs/specs/virtual-tryon-generation.md scenario 2).

describe("try-on garment context", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("resolves a published product with an exact non-discontinued variant", async () => {
    const garment = await getTryOnGarmentContext(
      testDb.db,
      "longline-wool-overcoat",
      "M",
      "Camel",
    );

    expect(garment).toBeDefined();
    expect(garment).toMatchObject({
      slug: "longline-wool-overcoat",
      name: "Longline Wool Overcoat",
      composition: "Shell: 70% wool, 20% polyester, 10% cashmere. Lining: 100% viscose.",
      size: "M",
      color: "Camel",
      colorHex: "#C19A6B",
    });
    expect(garment?.productId).toBeTruthy();
  });

  it("keeps size and color as an exact pair (same color, other size resolves that size)", async () => {
    const small = await getTryOnGarmentContext(
      testDb.db,
      "longline-wool-overcoat",
      "L",
      "Camel",
    );
    const charcoal = await getTryOnGarmentContext(
      testDb.db,
      "longline-wool-overcoat",
      "M",
      "Charcoal",
    );

    expect(small?.size).toBe("L");
    expect(small?.color).toBe("Camel");
    expect(charcoal?.color).toBe("Charcoal");
    expect(charcoal?.colorHex).toBe("#3B4045");
  });

  it("resolves out-of-stock variants (stock is not a try-on gate)", async () => {
    const garment = await getTryOnGarmentContext(
      testDb.db,
      "longline-wool-overcoat",
      "S",
      "Camel",
    );

    expect(garment).toMatchObject({ size: "S", color: "Camel" });
  });

  it("rejects an unknown slug and an unknown combination", async () => {
    await expect(
      getTryOnGarmentContext(testDb.db, "does-not-exist", "M", "Camel"),
    ).resolves.toBeUndefined();
    await expect(
      getTryOnGarmentContext(testDb.db, "longline-wool-overcoat", "XS", "Camel"),
    ).resolves.toBeUndefined();
    await expect(
      getTryOnGarmentContext(testDb.db, "longline-wool-overcoat", "M", "Navy"),
    ).resolves.toBeUndefined();
  });

  it("rejects draft and archived products even for their real variant pairs", async () => {
    await expect(
      getTryOnGarmentContext(testDb.db, "cropped-tweed-jacket", "S", "Boucle Ivory"),
    ).resolves.toBeUndefined();
    await expect(
      getTryOnGarmentContext(testDb.db, "satin-evening-gown", "S", "Black"),
    ).resolves.toBeUndefined();
  });

  it("rejects a discontinued variant", async () => {
    const productVariants = await listVariantsByProductId(
      testDb.db,
      (await getTryOnGarmentContext(testDb.db, "longline-wool-overcoat", "M", "Camel"))
        ?.productId ?? "",
    );
    const productId = productVariants[0]?.productId;
    expect(productId).toBeTruthy();

    await insertVariant(testDb.db, {
      productId: productId as string,
      size: "XS",
      color: "Discontinued Camel",
      colorHex: "#C19A6B",
      stockQty: 3,
      discontinued: true,
    });

    await expect(
      getTryOnGarmentContext(
        testDb.db,
        "longline-wool-overcoat",
        "XS",
        "Discontinued Camel",
      ),
    ).resolves.toBeUndefined();
  });
});
