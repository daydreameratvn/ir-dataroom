---
name: git-workflow
description: |
  Git branching, commit safety, commit mechanism, rebase, and PR workflow for Banyan.
  Use when: committing code, creating branches, pushing code, creating PRs,
  rebasing, merging, or any git operation beyond simple reads.
  Triggers on: git commit, git push, git branch, git rebase, gh pr create,
  or when finishing a task and preparing to commit/push.
---

# Git Workflow & Safety

## Branching Strategy

- `main` — production branch, always deployable
- `feat/<name>` — feature branches, created from main
- `fix/<name>` — bug fix branches
- `chore/<name>` — maintenance/infrastructure changes

Branch naming: lowercase, kebab-case, short and descriptive. Examples: `feat/claim-intake-page`, `fix/markdown-table-scroll`, `chore/upgrade-vite`.

## Worktree Usage

Use git worktrees to isolate risky or parallel work without polluting the main checkout:

**When to use worktrees:**
- Database migrations (risk of breaking running app)
- Dependency upgrades (may break compilation)
- Large refactors spanning many files
- Parallel feature development
- Any change that might leave the repo in a non-compiling state for more than a few minutes

**How:**
- Claude Code subagents: use `isolation: "worktree"` — the agent gets an isolated copy of the repo
- Manual: `git worktree add ../banyan-<branch> -b <branch>`
- Cleanup: `git worktree remove ../banyan-<branch>` after merging

**Rules:**
- Never work directly on `main` for non-trivial changes — always create a branch
- Worktrees share the same `.git` — commits in any worktree are visible to all
- Keep worktrees short-lived — merge or discard within the same session when possible

## Commit Safety for AI Agents

AI agents (Claude Code) MUST follow these rules to prevent "point of no return" disasters:

1. **Commit at every checkpoint** — Make small, atomic commits at natural stopping points:
   - After each working component/feature is complete
   - After successful typecheck/test passes
   - Before starting risky refactors or dependency changes
   - Before modifying shared configs (tsconfig, package.json, vite.config)
   - Before deleting any files or directories

2. **Never batch large changes** — If a change touches more than 5-7 files or crosses module boundaries, split into multiple commits. Each commit should be independently revertable.

3. **Commit before destructive operations** — Always commit current work before:
   - Deleting files or directories
   - Running database migrations
   - Changing package dependencies
   - Rebasing or merging branches
   - Modifying build/deploy configs

4. **Descriptive commit messages** — Use conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Explain WHY, not just WHAT.

5. **Recovery checkpoints** — During multi-step operations (scaffolding, migrations, large refactors), commit after each successful step. The user must be able to `git reset --soft` to any intermediate state without losing work.

6. **Never amend or squash** — Always create new commits. Never use `git commit --amend`, `git rebase -i` (squash/fixup), or `git reset` to rewrite history. If a commit needs fixing, create a new fix commit on top. Clean, linear history is preferred over "perfect" history.

7. **Verify before committing** — Run typecheck (and relevant tests) before every commit. Never commit code that doesn't compile.

8. **When in doubt, commit** — It's always safer to have one extra commit than to lose 30 minutes of work. Commits are cheap; lost work is expensive.

## Commit Mechanism (5-Step Procedure)

**Step 1 — Verify the change compiles:**
```bash
# Run the relevant workspace typecheck (pick whichever applies)
cd platform && bun run typecheck   # if platform/ files changed
cd sdks && bun run typecheck       # if sdks/ files changed
cd mobile && bun run typecheck     # if mobile/ files changed
```
Do NOT commit if typecheck fails. Fix the errors first.

**Step 2 — Stage specific files (never `git add -A` or `git add .`):**
```bash
git add path/to/file1 path/to/file2
```
Review what's staged with `git diff --cached --stat`. Never stage `.env`, credentials, `node_modules`, `dist`, or lockfiles unless intentional.

**Step 3 — Write the commit message:**
```
<type>(<scope>): <short summary>

<optional body — explain WHY, not WHAT>
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`
Scope: the workspace or area (`platform`, `sdks`, `mobile`, `hasura`, `agents`, `infra`, `root`)

Examples:
- `feat(platform): add claims intake page with form validation`
- `fix(sdks): resolve workspace dependency resolution for react SDK`
- `chore(root): update onboard script to check Claude Code auth`
- `refactor(hasura): extract migration helpers into shared lib`

**Step 4 — Commit (never skip hooks):**
```bash
git commit -m "<message>"
```
Never use `--no-verify`. If a hook fails, fix the issue and retry.

**Step 5 — Confirm success:**
```bash
git status   # should show clean working tree or only unrelated changes
```

**Branching:**
- Always work on a feature branch (`feat/`, `fix/`, `chore/`), never commit directly to `main`
- Push with `-u` on first push: `git push -u origin feat/<name>`
- Do NOT push to `main` without explicit user approval

## Sync with Main Before Push (Mandatory)

Before pushing code or creating a PR, Claude Code MUST rebase the working branch on the latest `origin/main`:

```bash
git fetch origin main
git rebase origin/main
```

- If rebase conflicts occur, resolve them, then `git rebase --continue`.
- After a successful rebase, run typecheck again to confirm the code still compiles with the latest main changes.
- Only after rebase + typecheck pass, push the branch: `git push -u origin <branch>` (use `--force-with-lease` if the branch was previously pushed and rebase rewrote history).

## Always Create a PR After Completing Tasks

After all tasks in a session are finished, committed, and pushed, Claude Code MUST create a pull request to merge the working branch into `main`:

1. Push the branch if not already pushed.
2. Create the PR using `gh pr create` with a clear title and description summarizing all changes.
3. Return the PR URL to the user.

Do NOT wait for the user to ask — PR creation is the final step of every task. If the user explicitly says not to create a PR, skip this step.
