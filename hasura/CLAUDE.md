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
- `brew install --cask session-manager-plugin` — AWS SSM tunnel for DB access
- AWS credentials configured (`AWS_PROFILE=banyan`)
- One-time: `bun run hasura:setup-hosts` to add `hasura.banyan.local` to `/etc/hosts`

## Commands

All commands assume `AWS_PROFILE=banyan` is set or the default profile has access.

```bash
# Start local GraphiQL console (connects to remote engine)
AWS_PROFILE=banyan bun run hasura:start

# SSM tunnel to RDS (required for migrations — RDS is in isolated subnets)
AWS_PROFILE=banyan bun run hasura:tunnel

# Database migrations (via dbmate, requires SSM tunnel running in another terminal)
AWS_PROFILE=banyan bun run hasura:migrate -- --tunnel    # Apply pending migrations
AWS_PROFILE=banyan bun run hasura:migrate:new            # Create new migration file
# NOTE: Never use rollback. Write a new forward migration instead.

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
| `ecs-ndc-service` | String | NDC connector service name (used by deploy) |

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
│   ├── tunnel.ts             # SSM port-forwarding tunnel to RDS
│   ├── migrate.ts            # dbmate wrapper with Secrets Manager + tunnel support
│   ├── introspect.ts         # Query remote engine introspection
│   └── deploy.ts             # Upload metadata to S3, trigger ECS redeploy
└── lib/
    ├── ssm.ts                # SSM parameter fetching utility
    └── db.ts                 # DB connection utility (Secrets Manager, SSL, pg_dump)
```

## SSM Tunnel

RDS is in isolated subnets with no direct internet access. All database operations (migrations, manual queries) require an SSM port-forwarding tunnel through the bastion host.

1. Start the tunnel in a separate terminal:
   ```bash
   AWS_PROFILE=banyan bun run hasura:tunnel
   ```
2. The tunnel forwards `localhost:15432` to the RDS instance on port `5432`.
3. Run migrations with the `--tunnel` flag so dbmate connects via localhost:15432.
4. Press `Ctrl+C` to stop the tunnel when done.

The tunnel script auto-discovers the bastion instance ID (by tag `Name=banyan-prod-bastion`) and RDS host (from Secrets Manager `banyan-prod-db-credentials`).

## Migration Workflow

dbmate creates timestamped SQL files in `db/migrations/`. Each file has `-- migrate:up` and `-- migrate:down` sections.

```bash
# Create a new migration
AWS_PROFILE=banyan bun run hasura:migrate:new create_users

# Edit the generated file in db/migrations/
# Start tunnel in another terminal, then apply
AWS_PROFILE=banyan bun run hasura:migrate -- --tunnel

# The schema.sql file is auto-updated after migrate (requires pg_dump)
```

### Migration Rules

Migrations run directly against the production database. There are no staging environments or rollback procedures.

- **Always migrate up** — Never use rollback (`migrate:down`) in production. If a migration is wrong, write a new forward migration to fix it.
- **Leave `-- migrate:down` empty** — The down section exists for dbmate syntax but must not contain destructive SQL. Add a comment: `-- no rollback, write a new migration instead`.
- **All changes must be backward compatible** — The running application continues serving traffic during and after migration. Schema changes, data changes, and data migration scripts must not break the current deployed code.

### Backward-Compatible Schema Changes

| Safe | Unsafe (requires multi-step) |
|------|------------------------------|
| `ADD COLUMN` with `DEFAULT` or `NULL` | `DROP COLUMN` — first stop reading it, deploy, then drop |
| `CREATE TABLE` | `RENAME COLUMN` — add new column, backfill, update code, then drop old |
| `CREATE INDEX CONCURRENTLY` | `ALTER COLUMN TYPE` — add new column with new type, migrate data, switch code, drop old |
| `ADD CONSTRAINT` (check, not-null) with `NOT VALID` first | `DROP TABLE` — remove all references first, deploy, then drop |

### Example: Backward-Compatible Migration

```sql
-- migrate:up
-- Step 1: Add new column (nullable so existing rows are unaffected)
ALTER TABLE users ADD COLUMN email TEXT;

-- Step 2: Backfill existing data if needed
UPDATE users SET email = name || '@placeholder.local' WHERE email IS NULL;

-- migrate:down
-- no rollback, write a new migration instead
```

## Metadata Workflow

1. Edit `metadata/open_dd.json` to add models, relationships, permissions
2. Run `bun run hasura:introspect` to verify the engine schema
3. Run `bun run hasura:deploy` to push changes to production

The engine reloads metadata on ECS service restart.

## Rules

- **No .env files** — all config comes from SSM Parameter Store
- **No DDN CLI** — metadata is managed as plain JSON
- **No rollback** — never use `migrate:rollback` or write destructive `-- migrate:down` SQL. Always fix forward with a new migration.
- **Always read `db/schema.sql`** before writing migrations to understand the current schema
- **Always read `metadata/open_dd.json`** before modifying metadata
- **Backward compatibility** — all schema and data changes must be safe for the currently deployed code. See "Migration Rules" above and the root `CLAUDE.md` for the full backward-compatibility workflow.
- Shared config: uses root `tsconfig.json` and `package.json`
