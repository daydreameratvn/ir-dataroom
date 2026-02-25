# Project Context

This is a monorepo for building Agents.

## Tech Stack

- **Language**: TypeScript
- **Local Runtime**: Bun
- **Package Manager**: Bun
- **Server Runtime**: Node.js
- **Cloud Provider**: AWS
- **IaC**: Pulumi for permanent infrastructure (VPC, subnets, RDS); SST for application (agent) deployment
- **Agent Coding**: Claude Code
- **Code Management**: Git & GitHub

## Folder Structure

```
/banyan
├── .github/workflows      # CI/CD (GitHub Actions)
├── .claude/               # Claude Code settings
├── agents/                # Agents
├── rootstock/             # Pulumi: VPC, RDS (PostgreSQL), IAM, S3 (Documents)
├── hasura/                # Hasura DDN (v3)
├── packages/              # Shared packages
├── bun.lockb
└── package.json
```

## Rules

- **Shared Configuration**: Sub-apps use the root `tsconfig.json` and `package.json` instead of maintaining their own.
- **Work Scope**: When working in a particular sub-app folder, do not read code in other folders. Only the root `tsconfig.json` or `package.json` may be relevant.

## Backward Compatibility

Deployments happen every day, multiple times a day. All code changes — features, refactors, bug fixes, schema changes — **must be backward compatible** to ensure zero-downtime deployments.

### Workflow

1. **Add new, keep old** — Introduce the new version alongside the existing one. Both versions must work simultaneously.
2. **Controlled switchover** — Use feature flags, version auto-switch, or auto-fallback so traffic shifts to the new version gradually or automatically.
3. **Remove old after verification** — After confirming no consumers rely on the old version, remove it in a separate change.

### Practices

- **Feature flags**: Gate new behavior behind flags. Default to the old behavior until the flag is enabled.
- **Auto-fallback**: New code paths should fall back to the old behavior on failure.
- **API versioning**: When changing API contracts (REST, GraphQL, event schemas), support both old and new schemas during the transition period.
- **Database changes**: Only additive schema changes (add columns, add tables). Never drop columns, rename columns, or change types in-place. See `hasura/CLAUDE.md` for migration-specific rules.
- **Refactoring**: When renaming or restructuring, keep the old entry point working (re-export, adapter, alias) until all callers are migrated.
- **Dependencies**: When updating shared packages, ensure all consumers in the monorepo work with both old and new versions during rollout.
