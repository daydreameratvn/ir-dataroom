---
name: backward-compatibility
description: |
  Backward compatibility rules for zero-downtime deployments.
  Use when: making breaking changes, modifying APIs, changing database schemas,
  renaming/restructuring code, updating shared packages, or deploying new features.
  Triggers on: API changes, schema changes, refactoring, dependency updates,
  feature flags, or any change that could affect existing consumers.
---

# Backward Compatibility

Deployments happen every day, multiple times a day. All code changes — features, refactors, bug fixes, schema changes — **must be backward compatible** to ensure zero-downtime deployments.

## Workflow

1. **Add new, keep old** — Introduce the new version alongside the existing one. Both versions must work simultaneously.
2. **Controlled switchover** — Use feature flags, version auto-switch, or auto-fallback so traffic shifts to the new version gradually or automatically.
3. **Remove old after verification** — After confirming no consumers rely on the old version, remove it in a separate change.

## Practices

- **Feature flags**: Gate new behavior behind flags. Default to the old behavior until the flag is enabled.
- **Auto-fallback**: New code paths should fall back to the old behavior on failure.
- **API versioning**: When changing API contracts (REST, GraphQL, event schemas), support both old and new schemas during the transition period.
- **Database changes**: Only additive schema changes (add columns, add tables). Never drop columns, rename columns, or change types in-place. See `hasura/CLAUDE.md` for migration-specific rules.
- **Refactoring**: When renaming or restructuring, keep the old entry point working (re-export, adapter, alias) until all callers are migrated.
- **Dependencies**: When updating shared packages, ensure all consumers in the monorepo work with both old and new versions during rollout.
