#!/usr/bin/env bash
set -euo pipefail

# J. Armando — standard startup and verification path.
#
# Contract (do not weaken):
#   - Executes the non-blocking standard gate for the current repo state.
#   - MUST NOT start long-running processes such as `pnpm dev`.
#   - MAY print manual follow-up commands after the checks pass.
#   - Fails fast via `set -euo pipefail`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

# --- Toolchain ------------------------------------------------------------
# Node is managed by nvm in the user's home directory (see ARCHITECTURE.md).
# Load it if the current shell has not already.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  \. "${NVM_DIR}/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found on PATH." >&2
  echo "  Expected Node >= 24 via nvm at ${NVM_DIR}." >&2
  echo "  Install with: nvm install  (see ARCHITECTURE.md)" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found on PATH." >&2
  echo "  Enable it with: corepack enable && corepack prepare pnpm@12.11.2 --activate" >&2
  exit 1
fi

echo "Repository: ${REPO_ROOT}"
echo "Toolchain:  node $(node --version), pnpm $(pnpm --version)"

# --- Artifact sanity check ------------------------------------------------
echo ""
echo "Harness artifacts:"
for f in AGENTS.md PROGRESS.md feature_list.json init.sh ARCHITECTURE.md; do
  if [ -e "${REPO_ROOT}/${f}" ]; then
    echo "  [ok]      ${f}"
  else
    echo "  [missing] ${f}"
  fi
done

# --- Standard gate (non-blocking) ----------------------------------------
echo ""
echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo ""
echo "==> Lint..."
pnpm lint

echo ""
echo "==> Typecheck..."
pnpm typecheck

echo ""
echo "==> Tests..."
pnpm test

echo ""
echo "Standard gate passed: install + lint + typecheck + test."

# --- Manual follow-ups (never executed here) -----------------------------
echo ""
echo "Manual follow-up commands (not run by this script):"
echo "  pnpm build   # production build"
echo "  pnpm dev     # start the dev server (long-running; run it yourself)"
echo "  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # expect 200"
echo ""
echo "Database commands (need DATABASE_URL; see .env.example — not run by this script):"
echo "  pnpm db:migrate   # apply database migrations (idempotent)"
echo "  pnpm db:seed      # idempotent demo catalog seed (never overwrites rows)"
echo "  pnpm db:verify    # assert the catalog is populated"
echo "  pnpm db:devdb     # boot a disposable local PostgreSQL 17 (no Docker needed)"

exit 0
