import { defineConfig } from "drizzle-kit";

import { loadEnvFiles } from "./db/env.ts";

// drizzle-kit configuration (see docs/adr/0002-drizzle-data-access-layer.md).
// - `pnpm db:generate` writes reviewable SQL migrations to db/migrations.
// - `pnpm db:migrate` applies them against `DATABASE_URL`.
// `db/env.ts` loads `.env.local` / `.env` here (exported environment variables
// still win over file contents) so `db:migrate` honors them exactly like
// `db:seed` / `db:verify` do. Note: when both files define `DATABASE_URL`,
// drizzle-kit's own `.env` pre-load wins for this command — see
// ARCHITECTURE.md → Data Layer ("Env precedence").
// Migrations are generated once and committed; never edit an applied
// migration — generate a new one (see CONSTRAINTS.md).
loadEnvFiles();

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    // Required for `db:migrate`; unused by `db:generate`.
    url: process.env.DATABASE_URL ?? "",
  },
});
