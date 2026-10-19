// Public entry point of the Drizzle schema. Import tables and row types from
// here (`@/db/schema` or `./schema/index.ts`); keep table definitions grouped
// by domain in the sibling modules.
//
// Scope of this schema: catalog / cart / order / account only. AI-side
// conversation/message tables, collections, tax rates and seeded
// shipping-method rows belong to later features (see the
// `bootstrap-database-schema` spec and docs/domain-model.md). Virtual try-on
// deliberately has no table: photos and results are in-memory per request
// (CONSTRAINTS.md → Try-on privacy).

export * from "./enums.ts";
export * from "./catalog.ts";
export * from "./account.ts";
export * from "./cart.ts";
export * from "./order.ts";
