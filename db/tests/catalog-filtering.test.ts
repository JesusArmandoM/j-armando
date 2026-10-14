import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  insertCategory,
  insertProduct,
  insertVariant,
  listPublishedCatalogFilterOptions,
  listPublishedCatalogProducts,
} from "../catalog.ts";
import { seedCatalog } from "../seed.ts";
import { createTestDatabase, migrateDatabase } from "./harness.ts";
import type { TestDatabase } from "./harness.ts";

const DRAFT_AND_ARCHIVED = ["cropped-tweed-jacket", "ribbed-knit-cardigan", "satin-evening-gown"];

function slugs(products: { slug: string }[]): string[] {
  return products.map((p) => p.slug);
}

describe("catalog-filtering facets (seeded catalog)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);
    await seedCatalog(testDb.db);
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("filters by a single category slug", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      category: "coats",
      sort: "newest",
    });
    expect(slugs(products)).toEqual(["longline-wool-overcoat"]);
  });

  it("filters by size through non-discontinued variants", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { size: "L", sort: "newest" });
    expect(products).toHaveLength(5);
    expect(slugs(products).sort()).toEqual(
      [
        "double-breasted-linen-blazer",
        "cotton-poplin-shirt",
        "longline-wool-overcoat",
        "merino-crewneck-sweater",
        "pleated-wool-trousers",
      ].sort(),
    );
  });

  it("filters by color through non-discontinued variants", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      color: "Navy",
      sort: "newest",
    });
    expect(slugs(products)).toEqual(["double-breasted-linen-blazer"]);
  });

  it("filters by max price using the base price in integer cents", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      maxPrice: 150,
      sort: "newest",
    });
    expect(slugs(products).sort()).toEqual(["cotton-poplin-shirt", "merino-crewneck-sweater"]);
  });

  it("combines facets with AND", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      category: "blazers",
      size: "M",
      sort: "newest",
    });
    expect(slugs(products)).toEqual(["double-breasted-linen-blazer"]);
  });

  it("never includes draft or archived products under any filter", async () => {
    const combinations = [
      { sort: "newest" as const },
      { category: "blazers", sort: "newest" as const },
      { size: "L" as const, sort: "newest" as const },
      { color: "Black" as const, sort: "newest" as const },
      { maxPrice: 400, sort: "newest" as const },
    ];
    for (const filters of combinations) {
      const found = slugs(await listPublishedCatalogProducts(testDb.db, filters));
      for (const excluded of DRAFT_AND_ARCHIVED) {
        expect(found).not.toContain(excluded);
      }
    }
  });

  it("returns an empty set for an unknown facet value", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      color: "Chartreuse",
      sort: "newest",
    });
    expect(products).toEqual([]);
  });

  it("derives facet options from published, non-discontinued data only", async () => {
    const options = await listPublishedCatalogFilterOptions(testDb.db);

    expect(options.categories.map((c) => c.slug)).toEqual([
      "coats",
      "blazers",
      "dresses",
      "knitwear",
      "shirts",
      "trousers",
    ]);
    expect(options.sizes).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(options.colors).toEqual([
      "Black",
      "Burgundy",
      "Camel",
      "Charcoal",
      "Cream",
      "Ivory",
      "Navy",
      "Olive",
      "Sky Blue",
      "White",
    ]);
    // Colors that only exist on draft products must never be offered.
    expect(options.colors).not.toContain("Oatmeal");
    expect(options.colors).not.toContain("Chocolate");
    expect(options.colors).not.toContain("Boucle Ivory");
  });
});

describe("catalog-filtering sorts (controlled timestamps)", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);

    const cat = await insertCategory(testDb.db, { slug: "outerwear", name: "Outerwear", sortOrder: 1 });
    const insert = (slug: string, name: string, basePriceCents: number, createdAt: Date, status: "published" | "draft") =>
      insertProduct(testDb.db, {
        slug,
        name,
        description: `${name} description`,
        composition: "100% wool",
        care: "Dry clean only.",
        basePriceCents,
        currency: "USD",
        categoryId: cat.id,
        status,
        createdAt,
      });

    await insert("coat-beta", "Beta Coat", 10000, new Date("2024-01-01T00:00:00Z"), "published");
    await insert("coat-alpha", "Alpha Coat", 20000, new Date("2024-03-01T00:00:00Z"), "published");
    await insert("coat-gamma", "Gamma Coat", 10000, new Date("2024-02-01T00:00:00Z"), "published");
    await insert("coat-delta", "Delta Coat", 15000, new Date("2024-04-01T00:00:00Z"), "published");
    // Draft with the newest timestamp: must never surface in any ordering.
    await insert("coat-zeta", "Zeta Coat", 5000, new Date("2024-05-01T00:00:00Z"), "draft");
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("orders by newest (createdAt desc, tie-break name asc)", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { sort: "newest" });
    expect(products.map((p) => p.name)).toEqual([
      "Delta Coat",
      "Alpha Coat",
      "Gamma Coat",
      "Beta Coat",
    ]);
  });

  it("orders by price ascending (tie-break name asc)", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { sort: "price-asc" });
    expect(products.map((p) => p.name)).toEqual([
      "Beta Coat",
      "Gamma Coat",
      "Delta Coat",
      "Alpha Coat",
    ]);
  });

  it("orders by price descending (tie-break name asc)", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { sort: "price-desc" });
    expect(products.map((p) => p.name)).toEqual([
      "Alpha Coat",
      "Delta Coat",
      "Beta Coat",
      "Gamma Coat",
    ]);
  });

  it("orders by name ascending", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { sort: "name" });
    expect(products.map((p) => p.name)).toEqual([
      "Alpha Coat",
      "Beta Coat",
      "Delta Coat",
      "Gamma Coat",
    ]);
  });

  it("defaults to newest when no sort is given", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {});
    expect(products.map((p) => p.name)).toEqual([
      "Delta Coat",
      "Alpha Coat",
      "Gamma Coat",
      "Beta Coat",
    ]);
  });

  it("excludes the newest draft product from every ordering", async () => {
    for (const sort of ["newest", "price-asc", "price-desc", "name"] as const) {
      const found = (await listPublishedCatalogProducts(testDb.db, { sort })).map((p) => p.slug);
      expect(found).not.toContain("coat-zeta");
    }
  });
});

describe("catalog-filtering variant semantics", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    await migrateDatabase(testDb.db);

    const cat = await insertCategory(testDb.db, { slug: "test", name: "Test", sortOrder: 1 });

    const makeProduct = (slug: string, name: string) =>
      insertProduct(testDb.db, {
        slug,
        name,
        description: name,
        composition: "n/a",
        care: "n/a",
        basePriceCents: 10000,
        currency: "USD",
        categoryId: cat.id,
        status: "published",
      });

    const mixed = await makeProduct("mixed-facet", "Mixed Facet");
    // Size M + Blue and size L + Red on the same product: size and color match
    // through different variants.
    await insertVariant(testDb.db, { productId: mixed.id, size: "M", color: "Blue", colorHex: "#0000FF", stockQty: 5, discontinued: false });
    await insertVariant(testDb.db, { productId: mixed.id, size: "L", color: "Red", colorHex: "#FF0000", stockQty: 5, discontinued: false });

    const discontinued = await makeProduct("with-discontinued", "With Discontinued");
    await insertVariant(testDb.db, { productId: discontinued.id, size: "L", color: "Green", colorHex: "#00FF00", stockQty: 5, discontinued: true });
    await insertVariant(testDb.db, { productId: discontinued.id, size: "M", color: "Green", colorHex: "#00FF00", stockQty: 5, discontinued: false });
    // Discontinued-only color/size: must never be offered as a facet option.
    await insertVariant(testDb.db, { productId: discontinued.id, size: "XL", color: "Purple", colorHex: "#800080", stockQty: 5, discontinued: true });

    const outOfStock = await makeProduct("out-of-stock", "Out Of Stock");
    // Zero stock but not discontinued: still a match (availability, not stock).
    await insertVariant(testDb.db, { productId: outOfStock.id, size: "S", color: "Black", colorHex: "#000000", stockQty: 0, discontinued: false });
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("matches size and color independently through different variants", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      size: "M",
      color: "Red",
      sort: "newest",
    });
    expect(slugs(products)).toEqual(["mixed-facet"]);
  });

  it("ignores discontinued variants for the size facet", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { size: "L", sort: "newest" });
    expect(slugs(products)).toEqual(["mixed-facet"]);
  });

  it("ignores discontinued variants for the color facet", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, {
      color: "Green",
      sort: "newest",
    });
    expect(slugs(products)).toEqual(["with-discontinued"]);
  });

  it("counts out-of-stock variants as matches", async () => {
    const products = await listPublishedCatalogProducts(testDb.db, { size: "S", sort: "newest" });
    expect(slugs(products)).toEqual(["out-of-stock"]);
  });

  it("does not offer discontinued-only option values", async () => {
    const options = await listPublishedCatalogFilterOptions(testDb.db);
    // Green/Blue/Red/Black exist on non-discontinued variants; Purple and size
    // XL exist only on discontinued variants and must be excluded.
    expect(options.colors).toEqual(["Black", "Blue", "Green", "Red"]);
    expect(options.sizes).toEqual(["S", "M", "L"]);
  });
});
