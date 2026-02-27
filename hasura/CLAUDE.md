# Hasura — DDN Cloud (v3)

## Overview

This folder contains the Hasura DDN Cloud metadata (HML files) and database migrations for Papaya's PostgreSQL database. Hasura provides the GraphQL API layer consumed by both the agents and the platform frontend.

The GraphQL engine and NDC PostgreSQL connector run on **DDN Cloud** (Hasura's managed service). The database remains on **Amazon RDS** in `ap-southeast-1`, accessible to DDN Cloud via an NLB proxy.

## Tech Stack

- **Hasura**: DDN Cloud (managed v3)
- **Database**: PostgreSQL 17 (Amazon RDS, managed via Pulumi in `rootstock/`)
- **Metadata**: HML (YAML) files in `ddn/app/metadata/`
- **CLI**: `ddn` CLI for build, deploy, introspect, and local dev
- **RDS Connectivity**: NLB in public subnets proxies TCP 5432 to RDS

## Folder Structure

```
hasura/
├── CLAUDE.md
├── .env.example              # SSM parameter reference
├── ddn/                      # DDN Cloud project (project: banyan-prod)
│   ├── hasura.yaml           # DDN project config (v3)
│   ├── supergraph.yaml       # Supergraph definition
│   ├── .env                  # Local env (connector URLs, JWT key)
│   ├── .env.cloud            # Cloud env (NLB connection URI, JWT key) — gitignored
│   ├── .gitignore
│   ├── globals/
│   │   ├── subgraph.yaml
│   │   └── metadata/
│   │       ├── auth-config.hml       # JWT HS256 auth
│   │       ├── graphql-config.hml
│   │       └── compatibility-config.hml
│   └── app/
│       ├── subgraph.yaml
│       ├── metadata/         # HML files (models, commands, relationships)
│       │   ├── banyan_pg.hml         # DataConnectorLink (NDC schema)
│       │   ├── banyan_pg-types.hml   # Scalar/object type mappings
│       │   ├── Claims.hml            # Model + ObjectType + Relationships
│       │   ├── InsertClaims.hml      # Insert command
│       │   ├── UpdateClaimsById.hml  # Update command
│       │   ├── DeleteClaimsById.hml  # Delete command
│       │   └── ...                   # ~140 files for 35 tables
│       └── connector/
│           └── banyan_pg/
│               ├── connector.yaml
│               └── configuration.json
├── db/
│   └── migrations/           # SQL migrations using dbmate
├── lib/
│   ├── db.ts                 # Database connection helpers
│   └── ssm.ts                # AWS SSM Parameter Store client
├── scripts/
│   ├── deploy.ts             # DDN Cloud deploy (fetches secrets from SSM)
│   ├── setup-env.ts          # Generate local .env from SSM
│   ├── migrate.ts            # Database migration runner (dbmate)
│   ├── tunnel.ts             # SSM port-forwarding to RDS
│   ├── convert-permissions.ts # JSON→HML converter (one-time use)
│   └── validate-migration.ts # Migration validation queries
└── console/
    └── index.html            # GraphiQL template (legacy, use ddn console)
```

## Commands

| Command | Purpose |
|---------|---------|
| `bun run hasura:deploy` | Build and deploy supergraph to DDN Cloud (fetches secrets from SSM) |
| `bun run hasura:setup` | Generate local `.env` from AWS SSM (run once per checkout) |
| `bun run hasura:start` | Start local DDN dev environment |
| `bun run hasura:introspect` | Introspect database and update connector schema |
| `bun run hasura:console` | Open DDN Cloud console |
| `bun run hasura:tunnel` | SSM tunnel to RDS (localhost:15432) |
| `bun run hasura:migrate` | Run database migrations (dbmate) |
| `bun run hasura:migrate:new` | Create new migration file |

## Migration Rules (Critical)

All migrations MUST follow the backward compatibility rules from the root `CLAUDE.md`. Database changes are the highest-risk area for zero-downtime deployments.

### Table Convention — Audit Columns (Mandatory)

Every table MUST include these 6 audit columns:

```sql
created_at   timestamptz NOT NULL DEFAULT now(),
updated_at   timestamptz NOT NULL DEFAULT now(),
deleted_at   timestamptz,
created_by   uuid        REFERENCES users(id),
updated_by   uuid        REFERENCES users(id),
deleted_by   uuid        REFERENCES users(id)
```

- `created_at` / `updated_at` — auto-set via `DEFAULT now()`, `updated_at` refreshed on every write
- `deleted_at` — soft-delete marker (non-null = deleted), always filter `WHERE deleted_at IS NULL`
- `created_by` / `updated_by` / `deleted_by` — FK to `users.id`, nullable for system-generated rows
- Never hard-delete rows. Always soft-delete by setting `deleted_at` + `deleted_by`.
- Add index on `deleted_at` for every table: `CREATE INDEX idx_<table>_deleted_at ON <table> (deleted_at);`

### Allowed

- Add new tables (must include all 6 audit columns above)
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

### Adding a New Table

1. **Create migration**: `bun run hasura:migrate:new create_<table_name>`
2. **Write SQL**: Forward-only, additive changes
3. **Introspect**: `bun run hasura:introspect` to update connector schema
4. **Add models**: `cd hasura/ddn && ddn model add banyan_pg "<table>"` (or create HML manually)
5. **Deploy**: `bun run hasura:deploy`

### Permissions

- Permissions are defined in HML files (ModelPermissions, TypePermissions)
- Role-based access: `admin`, `executive`, `manager`, `staff`, `viewer` (from `user_level` DB enum)
- Default deny — every table/column must have explicit permission grants
- Row-level security uses session variables (`x-hasura-user-id`, `x-hasura-tenant-id`, `x-hasura-default-role`)
- **Current state**: Only `admin` role has permissions (full unrestricted access). Non-admin roles (`executive`, `manager`, `staff`, `viewer`) need ModelPermissions/TypePermissions added with tenant-scoped row-level filters.

## DDN Cloud

- **Project**: `banyan-prod`
- **API URL**: `https://banyan-prod.ddn.hasura.app/graphql`
- **Console**: `https://console.hasura.io/project/banyan-prod`
- **Auth**: JWT HS256 via `Authorization: Bearer <token>` header

## Secrets

All secrets are stored in **AWS SSM Parameter Store** under `/banyan/hasura/`. No secrets in `.env` files — they are generated from SSM by scripts.

| SSM Parameter | Type | Purpose |
|---------------|------|---------|
| `jwt-secret-key` | SecureString | JWT HMAC HS256 key for DDN Cloud auth |
| `ddn-connection-uri` | SecureString | RDS connection string via NLB for DDN Cloud |
| `db-connection-uri` | SecureString | Direct RDS connection string (migrations/tunnel) |
| `admin-token` | SecureString | Pre-signed admin JWT for API access |
| `rds-nlb-endpoint` | String | NLB DNS name |
| `ddn-cloud-endpoint` | String | DDN Cloud GraphQL API URL |

- **`hasura:deploy`** fetches `ddn-connection-uri` + `jwt-secret-key` from SSM → generates temp `.env.cloud` → deploys → cleans up
- **`hasura:setup`** fetches `db-connection-uri` + `jwt-secret-key` from SSM → generates `.env` for local dev
- **CI/CD** fetches secrets via IAM role (`AWS_DEPLOY_ROLE_ARN`) from SSM during GitHub Actions

## Work Scope

When working in this folder, only reference:
- Files within `hasura/`
- Root `tsconfig.json` and `package.json` if relevant
- `rootstock/` only to understand database connection config

Do not read or modify files in `agents/`, `platform/`, or `packages/`.
