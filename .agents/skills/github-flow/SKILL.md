---
name: github-flow
description: Orchestrate end-to-end multi-feature GitHub delivery on top of feature-flow using git and gh. Manages issues, isolated worktrees in ../tienda-worktrees/<id>, independent environments (.env with dedicated port and database), opencode sessions, push, PR creation against main with acceptance evidence, and clean worktree teardown. Never merges.
---

# GitHub Flow

Coordinate one or more `feature_list.json` features across a GitHub repository. This skill owns the end-to-end repository lifecycle: issue tracking, branch and worktree topology, isolated environment configuration, independent `opencode` execution sessions, push, and Pull Requests against `main`.

It reuses `feature-flow` (`../feature-flow/SKILL.md`) for the planner/implementer/validator loop inside each isolated worktree session and never implements product code directly in the orchestrator.

## Contrato (Lifecycle Contract)

The skill executes the full delivery loop across seven contract pillars:

1. **Entrada (Inputs & Defaults)**
2. **Antes de ejecutar (Preconditions & Gating)**
3. **Por feature (Execution & Isolation)**
4. **Si se repite (Idempotency & Work Preservation)**
5. **Publicar (Publishing Gate & PR)**
6. **Al terminar (Worktree Teardown)**
7. **Salida (Structured Output Report)**

---

## 1. Entrada (Inputs & Defaults)

- **Input parameter**: `feature_ids` — a list of one or more feature IDs from `feature_list.json` (e.g. `["catalog-product-listing"]`).
- **Default fallback (when no feature ID is provided)**:
  - **Repository**: Current repository checkout (slug resolved from `git remote get-url origin`).
  - **Base branch**: `main`.
  - **Feature selection**: Automatically select the next available feature according to `feature-flow` rules:
    1. A feature with status `in_progress`.
    2. The first feature with status `passing` in `feature_list.json` order (`passing` = self-verified, awaiting independent acceptance).
    3. The first feature in `feature_list.json` order whose status is neither `passing` nor `accepted`, whose `depends_on` prerequisites are all `accepted`, and already has a spec (`docs/specs/<id>.md`).
    4. The first feature in `feature_list.json` order whose status is neither `passing` nor `accepted`, whose `depends_on` prerequisites are all `accepted`, and has no spec yet.
  - If any candidate feature is blocked by unfinished dependencies, report the blocking dependency IDs and stop.

---

## 2. Antes de ejecutar (Preconditions & Gating)

Before mutating git, GitHub, or any local files, all four preconditions must be verified. If any precondition fails, report the failure and stop:

1. **Dependencias aceptadas**: Every dependency listed in `depends_on` for the feature must have status `accepted` in `feature_list.json`. If any dependency is missing or not `accepted`, the feature is marked `blocked` and not started.
2. **Base limpia**: The base checkout must have no unstaged, modified, or deleted tracked files (`git status --porcelain` has no tracked changes; untracked files are noted but non-blocking). There must be no active merge or rebase in progress, and the base branch `main` must resolve.
3. **Permisos**:
   - `gh auth status` must confirm an authenticated GitHub CLI session with permissions to read/create issues and PRs in the repository.
   - **Push permission**: The user must explicitly grant permission to push to the remote repository. Without explicit push permission, work remains local; no push and no PR can be created.
4. **Entornos independientes**: Each feature must execute in an isolated worktree outside the base checkout with its own dedicated port, database, and execution session.

---

## 3. Por feature (Execution & Isolation)

For each ready feature, the orchestrator executes the full lifecycle:

### A. Common Base SHA
- Fix a single common base SHA at the start of the execution run:
  ```bash
  base_sha=$(git rev-parse origin/main 2>/dev/null || git rev-parse main)
  ```
- All feature worktrees branch from this exact same base SHA.

### B. Issue (Create or Reuse)
- Check for existing issue first (read-only):
  ```bash
  gh issue list --state all --search "<feature-id>" --json number,title,url
  ```
  Match any issue whose title starts with `[<feature-id>]`.
- **If exists**: Reuse the existing issue number and URL. Do not duplicate.
- **If absent**: Create a temporary markdown body file (e.g. `/tmp/ja-issue-<feature-id>.md`) containing formatted feature metadata:
  ```markdown
  ## Summary
  <feature title from feature_list.json>

  ## User Visible Behavior
  <user_visible_behavior from feature_list.json>

  ## Dependencies
  <depends_on list>

  ## Verification Criteria
  <verification criteria from feature_list.json>
  ```
  Create the issue using `--body-file`:
  ```bash
  gh issue create --title "[<feature-id>] <feature-title>" --body-file /tmp/ja-issue-<feature-id>.md
  ```

### C. Branch and Worktree
- **Branch**: `feature/<feature-id>`.
- **Worktree path**: `../tienda-worktrees/<feature-id>`.
- Check if worktree or branch already exists:
  ```bash
  git worktree list | grep "tienda-worktrees/<feature-id>"
  git branch --list "feature/<feature-id>"
  ```
- **If exists**: Reuse the existing worktree path and branch.
- **If absent**: Create the worktree and branch from the common `base_sha`:
  ```bash
  git worktree add ../tienda-worktrees/<feature-id> -b feature/<feature-id> "$base_sha"
  ```

### D. Independent Environment (.env with dedicated Port and Database)
- Copy `.env` or `.env.example` from the base checkout to `../tienda-worktrees/<feature-id>/.env`.
- Assign independent environment settings in `../tienda-worktrees/<feature-id>/.env`:
  - **Dedicated `PORT`**: Allocate a distinct port (e.g. `3001`, `3002`, or based on feature offset) to ensure no conflict with the base dev server or other concurrent runs.
  - **Dedicated `DATABASE_URL`**: Set a unique database URL / database name (e.g. `postgresql://.../tienda_<feature-id>`) so migrations, seeds, and test instances run in complete isolation.

### E. Independent Session & feature-flow Loop
- Launch an independent session for the worktree:
  ```bash
  opencode run --dir ../tienda-worktrees/<feature-id> "Use feature-flow for <feature-id> only, until accepted."
  ```
- **Hard Rule: Never run two features in the same session.** Each feature runs in its own dedicated worktree session.
- `feature-flow` drives the planner -> implementer -> validator loop:
  - If spec is missing, `planner` drafts `docs/specs/<feature-id>.md`.
  - `implementer` develops the feature and runs self-verification.
  - `validator` performs independent verification (`accept`, `revise`, or `block`).
  - If `revise`, `implementer` repairs the finding and returns to `validator`.
  - On `accept`, `feature-flow` stages the feature changes and creates a local Conventional Commit on `feature/<feature-id>` (e.g. `feat: complete <feature-id>`).

---

## 4. Si se repite (Idempotency & Work Preservation)

- If a feature run is repeated or resumed:
  - **Reuse**: Reuse existing issue, branch, worktree, and PR.
  - **Do not duplicate**: Never create duplicate issues, duplicate branches, or duplicate PRs.
  - **Do not delete work in progress**: Never delete, force-remove, or wipe an existing worktree containing in-progress changes (`no git reset --hard`, `no git worktree remove --force`).

---

## 5. Publicar (Publishing Gate & PR)

Publishing to GitHub requires passing two strict gates:

1. **Acceptance Gate**: **Sin aceptación no se publica.**
   - The feature status in `feature_list.json` must be `accepted` with independent validator acceptance evidence.
   - Status `passing` (self-verified only) or `in_progress` is strictly ineligible for publishing.
2. **Push Permission Gate**: **Sin permiso no hay push.**
   - The user must explicitly authorize git push. Without push permission, commits remain local; do not push and do not create PRs.

### Push and PR Flow
When both gates pass:
1. Push branch to remote:
   ```bash
   git push -u origin feature/<feature-id>
   ```
2. Check for existing PR:
   ```bash
   gh pr list --state all --head "feature/<feature-id>" --base main --json number,url
   ```
3. Prepare formatted PR body file (e.g. `/tmp/ja-pr-<feature-id>.md`) including:
   - Summary of accepted changes.
   - Verification evidence and independent validator verdict.
   - User-facing manual testing steps (`Cómo probarlo`).
   - Reference to issue: `Closes #<issue-number>`.
4. **If PR exists**: Update existing PR body with latest evidence.
5. **If PR absent**: Create PR targeting `main`:
   ```bash
   gh pr create --base main --head "feature/<feature-id>" --title "[<feature-id>] <feature-title>" --body-file /tmp/ja-pr-<feature-id>.md
   ```
6. **Hard Rule: El merge queda fuera.**
   - Never merge the PR.
   - Never enable auto-merge.
   - Merging is strictly reserved for human review and CI verification.

---

## 6. Al terminar (Worktree Teardown)

Once the feature lifecycle is complete and published:

- **Condition 1 (Clean)**: Worktree must be completely clean (`git -C ../tienda-worktrees/<feature-id> status --porcelain` returns empty).
- **Condition 2 (Pushed)**: All commits must be pushed to remote (`git -C ../tienda-worktrees/<feature-id> status` reports branch is up to date with `origin/feature/<feature-id>`).
- **If both conditions are met**: Remove the worktree to keep the system tidy:
  ```bash
  git worktree remove ../tienda-worktrees/<feature-id>
  ```
- **If dirty or unpushed**: **Do not delete the worktree.** Retain it intact and notify the user of the path and pending status so no work is ever lost.

---

## 7. Salida (Structured Output Report)

At the completion of the flow, provide a clear structured report containing one block per feature with these exact fields:

```text
- feature: <feature-id>
- rama: feature/<feature-id>
- estado: <accepted | published | blocked | in_progress | refused>
- commit: <commit-hash> <commit-subject> (or "none")
- evidencia: <summary of verification and independent validation acceptance>
- URL de la PR: <GitHub PR URL> (or "none")
```

---

## Execution Modes Reference

The skill can be invoked in two styles:

- **Unified Flow (Default)**: Executes the entire contract end-to-end (issue -> worktree -> env setup -> session -> publish -> cleanup).
- **Phased Modes**:
  - `plan` (planificar): Read-only dry run. Checks preconditions, inspects reusable issues/worktrees/branches, checks dependencies, and outputs the report with status `planned` and zero mutations.
  - `execute` (ejecutar): Provisions worktrees, issues, and environments; runs independent `opencode` feature-flow sessions; creates local commits.
  - `publish` (publicar): Evaluates acceptance and push permission; pushes branches and opens/updates PRs against `main`.
