# Hasura — DDN (v3) Configuration

## Overview

This folder contains the Hasura DDN (v3) metadata and migrations for Papaya's PostgreSQL database. Hasura provides the GraphQL API layer consumed by both the agents and the platform frontend.

## Tech Stack

- **Hasura**: DDN v3
- **Database**: PostgreSQL (managed via Pulumi in `rootstock/`)
- **Schema Management**: Hasura CLI migrations

## Folder Structure

```
hasura/
├── CLAUDE.md
├── metadata/              # Hasura DDN metadata (models, permissions, relationships)
├── migrations/            # SQL migration files
└── seeds/                 # Seed data for development
```

## Migration Rules (Critical)

All migrations MUST follow the backward compatibility rules from the root `CLAUDE.md`. Database changes are the highest-risk area for zero-downtime deployments.

### Allowed

- Add new tables
- Add new columns (with defaults or nullable)
- Add new indexes
- Add new views
- Add new functions
- Widen column constraints (e.g., varchar(50) → varchar(100))

### Never Do

- Drop columns or tables (deprecate first, remove after full migration)
- Rename columns or tables (add new, migrate, then alias)
- Change column types in-place (add new column, backfill, swap)
- Add NOT NULL to existing columns without a default
- Drop indexes that are actively queried

### Migration Workflow

1. Create migration: `hasura migrate create <name>`
2. Write forward-only SQL (no destructive changes)
3. Update Hasura metadata if new models/relationships are added
4. Test migration locally against a snapshot of production data
5. Deploy migration before deploying code that depends on the new schema

### Permissions

- All Hasura permissions are defined in metadata, not in SQL
- Role-based access: `admin`, `claims_processor`, `fwa_analyst`, `viewer`
- Default deny — every table/column must have explicit permission grants
- Row-level security uses session variables (`x-hasura-user-id`, `x-hasura-role`)

## Work Scope

When working in this folder, only reference:
- Files within `hasura/`
- Root `tsconfig.json` and `package.json` if relevant
- `rootstock/` only to understand database connection config

Do not read or modify files in `agents/`, `platform/`, or `packages/`.
