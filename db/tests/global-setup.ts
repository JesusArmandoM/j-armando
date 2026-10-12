import { startEmbeddedPostgres } from "../embedded-pg.ts";

// Vitest globalSetup for the `db` project (vitest.config.mts). Boots one
// ephemeral embedded PostgreSQL 17 server for the whole test run and stops it
// afterwards — the automated gate must stay self-contained: no Docker, no
// system PostgreSQL, no processes left behind (CONSTRAINTS.md).

interface GlobalSetupContext {
  provide: (key: string, value: unknown) => void;
}

export default async function globalSetup({ provide }: GlobalSetupContext) {
  const handle = await startEmbeddedPostgres();

  // Belt and braces for reaching the test server from workers: Vitest's
  // provide/inject channel plus the process environment (workers are spawned
  // after this setup runs, so they inherit it).
  provide("jaTestDatabaseUrl", handle.url);
  process.env.JA_TEST_DATABASE_URL = handle.url;

  return async () => {
    await handle.stop();
  };
}
