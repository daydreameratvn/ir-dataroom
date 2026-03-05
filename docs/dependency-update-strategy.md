# Dependency Update Strategy

> A repeatable process for Claude Code (or any coding agent) to keep Banyan's dependencies current without breaking production.

---

## 1. Landscape

Banyan has **5 independent dependency trees**, each with its own lockfile:

| Tree | Root | Lockfile | Workspaces |
|------|------|----------|------------|
| **Root** | `/` | `bun.lock` | Agents, Pulumi infra, Hasura scripts |
| **Platform** | `platform/` | `platform/bun.lock` | `apps/*`, `libs/*` |
| **Auth** | `auth/` | `auth/bun.lock` | Standalone |
| **SDKs** | `sdks/` | `sdks/bun.lock` | `node/*`, `react/*`, `react-native/*` |
| **Mobile** | `mobile/` | `mobile/bun.lock` | Standalone (Expo) |

Each tree is updated independently. Never run `bun update` at the repo root expecting it to cascade.

---

## 2. Risk Tiers

Categorize every dependency update by risk before touching it.

### Tier 1 — Low Risk (auto-merge candidate)
- Patch bumps of well-tested libraries (`1.2.3` → `1.2.4`)
- Dev-only dependencies (linters, formatters, type definitions)
- `@types/*` packages

### Tier 2 — Medium Risk (requires full test suite)
- Minor bumps (`1.2.x` → `1.3.0`)
- Libraries with broad usage (TanStack Query, Zustand, Hono, Lucide)
- Testing libraries (Vitest, Testing Library, jsdom)

### Tier 3 — High Risk (requires manual verification + staging)
- Major bumps (`v1` → `v2`)
- Framework upgrades (React, Vite, Expo SDK, React Native, React Router)
- Build tooling (TypeScript, Tailwind CSS, Module Federation)
- `@mariozechner/pi-*` agent framework packages
- Anything that changes runtime behavior (crypto, auth, networking)

### Tier 4 — Critical (requires dedicated branch + extensive testing)
- React major version
- Expo SDK major version
- Vite major version
- TypeScript major version
- Module Federation major version
- Tailwind CSS major version

---

## 3. Update Frequency

| Tier | Cadence | Who |
|------|---------|-----|
| Tier 1 | Weekly (batch all together) | Agent, auto-merge after CI passes |
| Tier 2 | Biweekly | Agent, human reviews PR |
| Tier 3 | Monthly or on release | Agent prepares PR, human tests in staging |
| Tier 4 | Per release cycle (quarterly) | Human-led, agent assists |

---

## 4. The Update Process

### Step 0 — Preparation

```bash
# Always work in a worktree
git worktree add ../banyan-deps-<tree>-<date> -b chore/deps-<tree>-<date>
cd ../banyan-deps-<tree>-<date>
```

### Step 1 — Audit

Check what's outdated in the target tree:

```bash
cd <tree-root>   # e.g., cd platform/
bun outdated
```

Capture the full output. Classify each outdated package into a risk tier.

### Step 2 — Update (One Tier at a Time)

**Never mix tiers in a single commit.** Update in this order:

1. Tier 1 (all at once) → commit
2. Tier 2 (one logical group at a time) → commit each group
3. Tier 3 (one package at a time) → commit each
4. Tier 4 (dedicated PR per package)

For each update:

```bash
cd <tree-root>
bun update <package-name>    # or bun add <package>@latest for major bumps
```

### Step 3 — Validate (After Every Commit)

Run the full validation suite for the affected tree:

#### Root (agents/infra)
```bash
# Typecheck
tsgo --noEmit

# No formal test suite — verify agent tools load
bun run agents/drone/runner.ts --dry-run   # or equivalent smoke test
```

#### Platform
```bash
cd platform

# 1. Install
bun install

# 2. Typecheck all workspaces
bun run typecheck

# 3. Run all tests
bun run test

# 4. Build all apps (catches runtime import/bundling issues)
bun run build

# 5. Manual smoke test (if Tier 3+): start dev server and verify in browser
bun run dev:shell
```

#### Auth
```bash
cd auth

# 1. Install
bun install

# 2. Typecheck
tsgo --noEmit

# 3. Run tests
bun test

# 4. Build (Docker) — catches missing modules
docker build -f Dockerfile ..
```

#### SDKs
```bash
cd sdks

# 1. Install
bun install

# 2. Typecheck
bun run typecheck

# 3. Run tests
bun run test

# 4. Build (emits dist/ — catches type export issues)
bun run build
```

#### Mobile
```bash
cd mobile

# 1. Install
bun install

# 2. Typecheck
tsgo --noEmit

# 3. Run tests
bun test

# 4. Expo doctor (checks SDK compatibility)
bunx expo-doctor
```

### Step 4 — Commit

Follow the project commit conventions:

```bash
git add <specific-files>   # lockfile + package.json(s)
git commit --author="Claude Code <noreply@anthropic.com>" -m "$(cat <<'EOF'
chore(<scope>): update <description>

<package>: x.y.z → x.y.w
<package>: x.y.z → x.y.w

Co-Authored-By: deathemperor <deathemperor@gmail.com>
EOF
)"
```

### Step 5 — PR

One PR per dependency tree per session. Title format:

```
chore(<tree>): dependency updates <date>
```

PR body should include:
- List of all updated packages with old → new versions
- Risk tier of each
- Test results summary
- Any breaking changes encountered and how they were resolved
- Any packages intentionally skipped and why

---

## 5. Validation Matrix

What to run for each dependency tree after updates:

| Check | Root | Platform | Auth | SDKs | Mobile |
|-------|------|----------|------|------|--------|
| `bun install` | x | x | x | x | x |
| `tsgo --noEmit` | x | - | x | - | x |
| `bun run typecheck` | - | x | - | x | - |
| `bun run test` | - | x | x | x | x |
| `bun run build` | - | x | - | x | - |
| Docker build | - | - | x | - | - |
| `expo-doctor` | - | - | - | - | x |
| Dev server smoke test | - | Tier 3+ | Tier 3+ | - | - |
| Browser manual test | - | Tier 4 | - | - | - |
| Device manual test | - | - | - | - | Tier 4 |

---

## 6. Dealing with Breakage

### Typecheck Fails

1. Read the error. Most dep updates cause type signature changes.
2. Check the package changelog/migration guide.
3. Fix the consuming code — don't pin the old version unless the fix is non-trivial.
4. If the fix requires app logic changes (not just type annotations), **stop and escalate to human**.

### Test Fails

1. Determine if the failure is a real regression or a test that depends on internal behavior.
2. If the library changed observable behavior → check if our usage was correct or relying on a bug.
3. Update tests if they relied on implementation details.
4. If a real regression → revert the update, open an issue upstream, pin the working version.

### Build Fails

1. Usually caused by ESM/CJS mismatches or changed exports.
2. Check if the package changed its `exports` map.
3. For Vite builds: check `optimizeDeps` and `ssr.noExternal` config.
4. For Module Federation: verify `shared` config still matches.

### Rollback

If an update cannot be fixed in a reasonable time:

```bash
# Revert the specific commit
git revert <commit-hash>

# Or revert the entire lockfile change
git checkout main -- <tree>/bun.lock <tree>/package.json
bun install
```

Document the reason in the PR body so the next attempt starts with context.

---

## 7. Special Handling

### React Upgrades

React is a Module Federation singleton. All platform apps and libs must be on the same major version. Never upgrade React in one app without upgrading all of them.

Checklist:
- [ ] Update `react` and `react-dom` in all platform `package.json` files simultaneously
- [ ] Update Module Federation `shared` config `requiredVersion`
- [ ] Update `@types/react` and `@types/react-dom`
- [ ] Update `@testing-library/react` if required
- [ ] Run full platform test suite
- [ ] Build all apps
- [ ] Smoke test in browser: shell + at least one remote app embedded

### Expo SDK Upgrades

```bash
cd mobile
bunx expo install --fix   # auto-resolves compatible versions
```

Expo pins many transitive deps. Let `expo install --fix` handle version resolution — don't manually bump React Native or Expo sub-packages.

### TypeScript Upgrades

TypeScript changes affect all 5 trees. Update all trees together:

1. Bump `typescript` in all `package.json` files
2. Run `tsgo --noEmit` / `bun run typecheck` in every tree
3. Fix any new strictness errors
4. Verify all builds still succeed

### Tailwind CSS Upgrades

Tailwind v4 uses a different config system than v3. For minor/patch bumps, just update. For major bumps, read the migration guide carefully — class names and config format may change.

### Agent Framework (`pi-mono`) Upgrades

`@mariozechner/pi-*` packages are actively developed. Check the pi-mono changelog before updating. Breaking changes in the agent loop, tool interface, or event system can silently break agent behavior even if types still compile.

Test by running an agent end-to-end after updating.

---

## 8. Known Version Constraints

Track packages that are intentionally pinned or constrained:

| Package | Constraint | Reason |
|---------|-----------|--------|
| `i18next` | `libs/i18n` on `^24`, `apps/shell` on `^25` | Migration in progress — align when possible |
| `@testing-library/react` | `^16` in platform, `^14` in sdks | Different React version requirements |
| `expo` | `~52.0.0` | Expo SDK pins — only upgrade via `expo install --fix` |

Update this table when adding new constraints.

---

## 9. Agent Execution Checklist

When a coding agent receives "update dependencies", follow this exact sequence:

```
1. [ ] Create worktree: chore/deps-<tree>-<YYYY-MM-DD>
2. [ ] Run `bun outdated` in target tree
3. [ ] Classify updates by risk tier
4. [ ] Present update plan to human for approval (skip for Tier 1 if pre-approved)
5. [ ] Update Tier 1 packages → validate → commit
6. [ ] Update Tier 2 packages (grouped) → validate → commit each group
7. [ ] Update Tier 3 packages (one at a time) → validate → commit each
8. [ ] Flag Tier 4 packages for separate PR
9. [ ] Push branch, create PR with full changelog
10. [ ] Update known constraints table if anything was skipped
```

---

## 10. CI Automation (Active)

### PR Validation

The `test.yml` workflow runs typecheck + tests for any tree whose files changed on every PR. This catches breakage from dependency updates before merge.

### Renovate Bot

`renovate.json` at the repo root implements the tier/cadence/grouping strategy:

| What | How |
|------|-----|
| Tier 1 (patches, dev deps, @types) | Weekly (Monday), auto-merge after CI passes |
| Tier 2 (minor bumps, AWS/Google/TanStack/Radix groups) | Biweekly (1st and 15th), human review |
| Tier 3 (major bumps, pi-mono, Pulumi) | Monthly (1st), human review |
| Tier 4 (React, Vite/MF, TypeScript, Tailwind) | Monthly (1st), labeled `critical-update`, human review |
| Expo/React Native in mobile | Disabled — use `bunx expo install --fix` manually |

Renovate groups related packages (AWS SDK, Google SDK, TanStack, Radix UI, AI SDK, testing libs) into single PRs to reduce noise. All PRs wait 3 days after release (`minimumReleaseAge`) to avoid publishing regressions.

### Weekly Dependency Audit

The `dependency-audit.yml` workflow runs every Monday at 2 AM ICT (or on-demand via `workflow_dispatch`). It runs `bun outdated` across all 5 trees and posts results to the GitHub Actions run summary. Use this to spot packages Renovate missed or that need manual intervention (e.g., Expo SDK).

### What's Still Manual

- **Expo SDK upgrades** — Run `cd mobile && bunx expo install --fix` in a worktree
- **Tier 4 upgrades** — Renovate creates the PR, but a human must test in staging/browser/device before merge
- **pi-mono upgrades** — Check the changelog before merging; agent behavior may change silently
