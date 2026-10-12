import { existsSync } from "node:fs";

// Environment handling for the `db:*` scripts. Node does not load .env files
// by itself, so these helpers read `.env.local` / `.env` (both gitignored)
// before falling back to the inherited environment. Real environment variables
// always win over file contents (process.loadEnvFile does not overwrite).

let envFilesLoaded = false;

export function loadEnvFiles(): void {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  for (const file of [".env.local", ".env"]) {
    try {
      if (existsSync(file)) {
        process.loadEnvFile(file);
      }
    } catch {
      // Ignore unreadable env files; the DATABASE_URL check below reports the gap.
    }
  }
}

/** Returns DATABASE_URL, loading .env.local / .env first. Throws when unset. */
export function getDatabaseUrl(): string {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a PostgreSQL database (see AGENTS.md), or export DATABASE_URL in your shell.",
    );
  }
  return url;
}
