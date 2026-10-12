import { isMainModule } from "./main.ts";
import { startEmbeddedPostgres } from "./embedded-pg.ts";

// `pnpm db:devdb` — boot an ephemeral PostgreSQL 17 server for manual `db:*`
// runs on machines without Docker or a system PostgreSQL (see AGENTS.md).
// Prints the DATABASE_URL to use, then blocks until Ctrl-C. Shutdown is
// handled by `embedded-postgres` itself: its process exit hook stops the
// server and deletes the temporary data directory (verified after Ctrl-C:
// no postgres process and no data directory are left behind).
//
// Tests never use this script; they boot their own server in
// db/tests/global-setup.ts and stop it explicitly in the teardown.

if (isMainModule(import.meta.url)) {
  const handle = await startEmbeddedPostgres();
  console.log("Embedded PostgreSQL 17 is running.");
  console.log(`  port: ${handle.port}`);
  console.log("");
  console.log("Use it for manual verification (keep this process running):");
  console.log("");
  console.log(`  export DATABASE_URL='${handle.url}'`);
  console.log("  pnpm db:migrate   # apply migrations (empty -> complete, idempotent)");
  console.log("  pnpm db:seed      # idempotent demo catalog seed");
  console.log("  pnpm db:verify    # assert the catalog is populated");
  console.log("");
  console.log("Press Ctrl-C to stop the server; nothing is left behind.");

  // Keep the process alive until it is interrupted.
  await new Promise<void>(() => {});
}
