import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * True when the given module URL is the script Node was invoked with. Used to
 * keep `db/seed.ts` and `db/verify.ts` importable by tests while still acting
 * as CLI entry points for `pnpm db:seed` / `pnpm db:verify`.
 */
export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return metaUrl === pathToFileURL(resolve(entry)).href;
}
