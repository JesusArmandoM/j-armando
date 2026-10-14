# Constraints

Durable MUST / MUST NOT rules for **J. Armando**. Future features must respect these. Add a rule only when implementation or verification revealed a durable operational constraint; keep each rule short and give its reason. Do not restate what `AGENTS.md`, `ARCHITECTURE.md` or a spec already covers.

## Money

1. **Money MUST be stored and computed as integer cents** (`bigint`) in `currency char(3) = 'USD'`; catalog prices are tax-exclusive and US sales tax is added at checkout. Reason: float money introduces rounding errors in order totals; the US/USD/tax-exclusive market decision is settled (see `docs/technical-discovery.md`).

## Schema and migrations

2. **Schema changes MUST go through new generated migrations** (`pnpm db:generate`); applied migrations in `db/migrations/` MUST NOT be edited by hand. Reason: applied migrations are tracked by hash (`drizzle.__drizzle_migrations`); editing them desynchronizes already-migrated databases. Introduced by `bootstrap-database-schema`.

## Seeds

3. **Seed scripts MUST stay insert-if-missing** (`ON CONFLICT DO NOTHING` on natural keys, one transaction): they MUST NOT update or delete existing rows. Reason: re-running a seed must never overwrite manual edits or duplicate data (spec `bootstrap-database-schema`, scenario 5). Demo catalog content lives in `db/seed-data.ts`.

## Automated tests

4. **The automated test suite MUST stay self-contained**: it MUST NOT require Docker, a system PostgreSQL installation or any configured database. DB integration tests use the ephemeral embedded PostgreSQL 17 server started per run (`db/tests/global-setup.ts`). Reason: `./init.sh` must stay green and restartable on any machine; this machine has neither Docker nor PostgreSQL (verified 2026-10-11).

5. **The automated suite MUST NOT make live calls to external AI providers and MUST NOT require their API keys.** Provider adapters must accept an injectable `fetch` (or equivalent transport seam) so their request/response contract can be proved offline. Reason: `./init.sh` must stay deterministic, free and key-free on any machine; introduced by `chat-assistant` (the OpenAI adapter is tested with an injected `fetch` and an in-process HTTP server).

## AI providers

6. **External AI capabilities MUST sit behind a repo-owned port** (interface) and be reached only through it; concrete providers are adapters behind the port. The UI and route handlers MUST depend on the port, not on a provider. Reason: providers must be swappable/simulatable without touching store code (`ARCHITECTURE.md` → Layering Intent). `ChatAssistant` (`lib/chat/`) is the first realised port; `payment-provider-abstraction` and virtual try-on follow the same rule.
