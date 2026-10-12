# ADR 0001 — The project is its own standalone Git repository

- Status: accepted
- Date: 2026-10-11
- Decided during: Session 003 (follow-up to `bootstrap-app-skeleton` independent validation)

## Context

The project directory (`/Users/armando/Documents/Ai Tienda de Ropa`) was not its own git repository. It sat inside a parent repository rooted at `/Users/armando/Documents` that had **no commits yet** and staged/untracked files from unrelated personal projects (for example Android practice code). Consequences observed during independent validation of `bootstrap-app-skeleton`:

- Diff-based review of a feature was impossible (`git diff` could not scope to this project).
- Clean-checkout and rollback as verification methods were impossible.
- A commit made from the parent repository would have swept unrelated personal code into the project's history.

No existing discovery document or harness rule required a VCS layout, so this was an unresolved gap rather than a contradiction of an accepted decision.

## Decision

Initialize a dedicated git repository at the project root. The parent `~/Documents` repository is **not** used for this project and this project must never be committed there.

Repository contents policy:

- Committed: harness (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`), discovery and architecture docs, application shell (`app/`, config files, `pnpm-lock.yaml`), agent configuration (`.opencode/`, `.agents/`), and the `stitch_image_based_application/` design reference (~1.3 MB).
- Ignored (via `.gitignore`): `node_modules/`, `.next/`, build and cache artifacts, env files, `.DS_Store`, and IDE metadata (`.idea/`, added in this session).

## Consequences

- Feature work is reviewable as a scoped diff and can be verified against a clean checkout.
- Rollback and bisect are available from `bootstrap-database-schema` onward.
- The project shows up as an untracked nested repository in the parent `~/Documents` repo. If the parent repository is ever committed, this project must be excluded from it (e.g. added to the parent's `.gitignore`).
- Working rule: commit at feature boundaries so that diffs stay scoped to one feature of `feature_list.json`.
