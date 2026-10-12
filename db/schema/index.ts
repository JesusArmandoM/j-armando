// Public entry point of the Drizzle schema. Import tables and row types from
// here (`@/db/schema` or `./schema/index.ts`); keep table definitions grouped
// by domain in the sibling modules.
//
// Scope of this schema: catalog / cart / order / account only. AI-side tables
// (conversation, message, try_on_session, photo), collections, tax rates and
// seeded shipping-method rows belong to later features (see the
// `bootstrap-database-schema` spec and docs/domain-model.md).

export * from "./enums.ts";
export * from "./catalog.ts";
export * from "./account.ts";
export * from "./cart.ts";
export * from "./order.ts";
