# Hasura DDN v3 Client

Local client project for managing a self-hosted Hasura DDN v3 engine on AWS ECS Fargate.

## What This Is

- **NOT** a Hasura CLI project — there is no DDN CLI involved
- A local GraphiQL console web app that connects to the remote engine on AWS
- Database migrations managed by **dbmate** (raw SQL, up/down)
- Supergraph metadata managed as plain JSON files
- All config fetched from AWS SSM Parameter Store at startup

## Prerequisites

- `brew install dbmate` — standalone migration tool
- AWS credentials configured (`AWS_PROFILE=banyan`)
- One-time: `bun run hasura:setup-hosts` to add `hasura.banyan.local` to `/etc/hosts`

## Commands

All commands assume `AWS_PROFILE=banyan` is set or the default profile has access.

```bash
# Start local GraphiQL console (connects to remote engine)
AWS_PROFILE=banyan bun run hasura:start

# Database migrations (via dbmate)
AWS_PROFILE=banyan bun run hasura:migrate              # Apply pending migrations
AWS_PROFILE=banyan bun run hasura:migrate:new           # Create new migration file
AWS_PROFILE=banyan bun run hasura:migrate:rollback      # Rollback last migration
AWS_PROFILE=banyan bun run hasura:migrate:status        # Show migration status

# Introspect remote engine schema
AWS_PROFILE=banyan bun run hasura:introspect

# Deploy metadata to production
AWS_PROFILE=banyan bun run hasura:deploy

# One-time setup
sudo bun run hasura:setup-hosts
```

## SSM Parameters

All parameters live under `/banyan/hasura/` in `ap-southeast-1`:

| Parameter | Type | Description |
|-----------|------|-------------|
| `engine-url` | String | ALB URL of remote engine |
| `admin-secret` | SecureString | Hasura admin secret |
| `db-connection-uri` | SecureString | RDS PostgreSQL connection string |
| `ndc-connector-url` | String | NDC connector internal URL |
| `metadata-s3-bucket` | String | S3 bucket for metadata (used by deploy) |
| `ecs-cluster` | String | ECS cluster name (used by deploy) |
| `ecs-engine-service` | String | ECS engine service name (used by deploy) |

## File Structure

```
hasura/
├── metadata/
│   ├── open_dd.json          # OpenDD supergraph metadata (source of truth)
│   ├── auth_config.json      # Auth config (noAuth + admin role)
│   └── metadata.json         # Introspection metadata
├── connector/
│   └── configuration.json    # NDC PostgreSQL connector config (version 5)
├── db/
│   ├── migrations/           # dbmate migration files (timestamped .sql)
│   └── schema.sql            # Auto-generated full schema dump (by dbmate)
├── console/
│   └── index.html            # GraphiQL page (ENGINE_URL injected at runtime)
├── scripts/
│   ├── start.ts              # Start local console
│   ├── setup-hosts.ts        # Add hasura.banyan.local to /etc/hosts
│   ├── migrate.ts            # dbmate wrapper with SSM config
│   ├── introspect.ts         # Query remote engine introspection
│   └── deploy.ts             # Upload metadata to S3, trigger ECS redeploy
└── lib/
    └── ssm.ts                # SSM parameter fetching utility
```

## Migration Workflow

dbmate creates timestamped SQL files in `db/migrations/`. Each file has `-- migrate:up` and `-- migrate:down` sections.

```bash
# Create a new migration
AWS_PROFILE=banyan bun run hasura:migrate:new create_users

# Edit the generated file in db/migrations/
# Then apply it
AWS_PROFILE=banyan bun run hasura:migrate

# The schema.sql file is auto-updated after up/rollback
```

Example migration file:
```sql
-- migrate:up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE users;
```

## Metadata Workflow

1. Edit `metadata/open_dd.json` to add models, relationships, permissions
2. Run `bun run hasura:introspect` to verify the engine schema
3. Run `bun run hasura:deploy` to push changes to production

The engine reloads metadata on ECS service restart.

## Rules

- **No .env files** — all config comes from SSM Parameter Store
- **No DDN CLI** — metadata is managed as plain JSON
- **Always read `db/schema.sql`** before writing migrations to understand the current schema
- **Always read `metadata/open_dd.json`** before modifying metadata
- Shared config: uses root `tsconfig.json` and `package.json`
