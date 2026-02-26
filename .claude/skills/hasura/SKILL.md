---
name: hasura
description: |
  Hasura database, permissions, naming, and table conventions for Banyan.
  Use when working with: database schema, migrations (dbmate), HML metadata files,
  permissions (ModelPermissions, TypePermissions, CommandPermissions),
  relationships, NDC PostgreSQL connector, or any Hasura DDN v3 supergraph modeling.
  Triggers on: SQL migrations, HML metadata edits, permission definitions, new tables/models,
  GraphQL schema changes, connector configuration, DDN Cloud deployment.
---

# Hasura DDN Cloud Conventions

Conventions for database schema, HML metadata, and permissions in Banyan.

**Architecture**: Hasura DDN Cloud (managed v3) with NDC PostgreSQL connector (`banyan_pg`). Metadata is HML (YAML) files in `hasura/ddn/app/metadata/`. Migrations use dbmate (raw SQL). See `hasura/CLAUDE.md` for commands, file structure, and migration rules.

**DDN Cloud**: Project `banyan-prod` at `https://banyan-prod.ddn.hasura.app/graphql`. Auth via JWT HS256 Bearer tokens.

## DB Connection

All scripts that connect to the database must use `hasura/lib/db.ts`:

```typescript
import { getDbUrl, getRdsHost, getPgDumpPath, TUNNEL_PORT } from "../lib/db.ts";
```

- `getDbUrl({ tunnel: true })` — Returns the connection URI with URL-encoded password (from Secrets Manager) and `sslmode=require` (required by RDS). Pass `tunnel: true` to rewrite host to `localhost:15432`.
- `getRdsHost()` — Extracts the RDS hostname (used by tunnel script).
- `getPgDumpPath()` — Finds `pg_dump` binary (checks PATH, then homebrew locations). Returns `null` if not found.

**Never** build connection strings manually, fetch passwords from SSM, or shell-interpolate credentials. The shared utility handles password encoding, SSL, and tool discovery.

## Database Conventions

### Table Naming

- **Plural** — `users`, `organizations`, `documents`.
- **Many-to-many** — both words plural, alphabetical: `authors_books`, `books_categories`.
- **Alphabetical grouping** — name tables so related tables sit together: `projects`, `projects_members`, `projects_tags`.

### Mandatory Columns

Every table (including many-to-many, excluding enum tables):

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | `UUID` | `gen_random_uuid()` | Primary key |
| `created_at` | `TIMESTAMPTZ` | `now()` | Immutable after insert |
| `created_by` | `UUID` | `NULL` | Nullable. Set via `x-hasura-user-id` session variable |
| `updated_at` | `TIMESTAMPTZ` | `now()` | Update via trigger or application |
| `updated_by` | `UUID` | `NULL` | Nullable. Set via `x-hasura-user-id` session variable |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` | Soft delete marker |

### Soft Delete

Data is never hard-deleted. Mark as deleted by setting `deleted_at = now()`. All queries must filter out `deleted_at IS NOT NULL` records — enforce this in ModelPermissions filters.

### Foreign Keys

All foreign keys use `RESTRICT`. No exceptions. Never use `CASCADE`, `SET NULL`, or `SET DEFAULT`.

### Indexes

- Primary key on `id` (automatic).
- Index on `deleted_at` for every table (soft delete filtering).
- Index on foreign key columns.
- Use `CREATE INDEX CONCURRENTLY` in migrations to avoid locking.

## Local Metadata Validation

Validate metadata locally before deploying to DDN Cloud:

```bash
cd hasura/ddn && ddn supergraph build local
```

- If valid: prints `Supergraph built for local Engine successfully`.
- If invalid: prints the exact error with HML file path and line number.
- Much faster than a cloud build — catches YAML syntax errors, missing env vars, and schema mismatches.

## HML Metadata Conventions

Metadata lives in `hasura/ddn/app/metadata/` as individual HML (YAML) files. Each file contains one or more metadata objects with `kind`, `version`, and `definition`. The DDN CLI generates these files — prefer CLI commands over manual editing.

### Key Files

| File | Purpose |
|------|---------|
| `banyan_pg.hml` | DataConnectorLink — NDC schema snapshot (16K+ lines, auto-generated) |
| `banyan_pg-types.hml` | Scalar type definitions and connector type mappings |
| `<ModelName>.hml` | Model + ObjectType + Relationships (e.g., `Claims.hml`, `Users.hml`) |
| `Insert<ModelName>.hml` | Insert mutation command |
| `Update<ModelName>ById.hml` | Update mutation command |
| `Delete<ModelName>ById.hml` | Delete mutation command |
| `globals/metadata/auth-config.hml` | JWT HS256 auth configuration |

### Naming

| Kind | Naming | Example |
|------|--------|---------|
| `ObjectType` | PascalCase, singular | `Users` (matches DB table name in DDN convention) |
| `Model` | PascalCase, plural | `Users`, `Claims`, `AgentSessions` |
| `Relationship` | camelCase | `tenant`, `policy`, `claimDiagnoses` |
| `Command` | PascalCase verb phrase | `InsertClaims`, `UpdateClaimsById`, `DeleteClaimsById` |
| `DataConnectorLink` | snake_case | `banyan_pg` |
| HML file name | PascalCase matching model | `Claims.hml`, `InsertClaims.hml` |

### GraphQL Naming Convention

The `app` subgraph uses `namingConvention: graphql` which converts snake_case DB columns to camelCase GraphQL fields automatically:
- `claim_number` → `claimNumber`
- `tenant_id` → `tenantId`
- `created_at` → `createdAt`

### Relationships

Relationships are auto-generated from foreign keys by the DDN CLI. They appear inside model HML files:

```yaml
---
kind: Relationship
version: v1
definition:
  name: tenant              # camelCase
  sourceType: Claims        # PascalCase ObjectType
  target:
    model:
      name: Tenants         # PascalCase Model
      relationshipType: Object  # Object = many-to-one, Array = one-to-many
  mapping:
    - source:
        fieldPath:
          - fieldName: tenantId
      target:
        modelField:
          - fieldName: id
```

## Permission Conventions

Three permission kinds. By default all access is denied — explicitly grant per role.

### Roles

Roles come from the `user_level` database enum, set in JWT claims:
- `admin` — full unrestricted access (currently the only role with permissions)
- `executive`, `manager`, `staff`, `viewer` — need permissions added

Session variables available in JWT:
- `x-hasura-default-role` — from `user_level`
- `x-hasura-allowed-roles` — hierarchical list (admin gets all roles)
- `x-hasura-user-id` — UUID
- `x-hasura-tenant-id` — UUID (for row-level tenant scoping)

### ModelPermissions (row-level)

Always filter out soft-deleted records for non-admin roles:

```yaml
kind: ModelPermissions
version: v1
definition:
  modelName: Users
  permissions:
    - role: admin
      select:
        filter: null  # unrestricted
    - role: viewer
      select:
        filter:
          and:
            - fieldComparison:
                field: tenantId
                operator: _eq
                value:
                  sessionVariable: x-hasura-tenant-id
            - not:
                fieldIsNull:
                  field: deletedAt
```

### TypePermissions (field-level)

Restrict sensitive fields per role:

```yaml
kind: TypePermissions
version: v1
definition:
  typeName: Claims
  permissions:
    - role: admin
      output:
        allowedFields:
          - id
          - claimNumber
          - status
          - aiScore
          - aiRecommendation
          - deletedAt
    - role: viewer
      output:
        allowedFields:
          - id
          - claimNumber
          - status
          # aiScore, aiRecommendation, deletedAt hidden from viewers
```

### CommandPermissions (mutation-level)

```yaml
kind: CommandPermissions
version: v1
definition:
  commandName: InsertClaims
  permissions:
    - role: admin
      allowExecution: true
```

### JWT Claims

Session variables come from JWT claims under the `https://hasura.io/jwt/claims` namespace (JSON Pointer: `/https:~1~1hasura.io~1jwt~1claims`). Required claims:

- `x-hasura-default-role` — applied when no role override header is sent.
- `x-hasura-allowed-roles` — array of roles the token holder can assume.
- `x-hasura-user-id` — used in permission filters.
- `x-hasura-tenant-id` — used for tenant-scoped row-level security.

## Adding a New Table Checklist

### Phase 1: Database Migration

1. Read `hasura/db/schema.sql` to understand current schema.
2. Create migration: `bun run hasura:migrate:new create_<table_name>`.
3. Write dbmate migration SQL (forward-only, backward-compatible — see `hasura/CLAUDE.md`).
4. Start SSM tunnel: `AWS_PROFILE=banyan bun run hasura:tunnel` (in a separate terminal).
5. Run migration: `AWS_PROFILE=banyan bun run hasura:migrate -- --tunnel`.

### Phase 2: Sync DDN Metadata

After the DB schema changes, update the connector and generate HML files:

1. **Introspect** — update the connector's configuration.json:
   ```bash
   bun run hasura:introspect
   ```

2. **Start local connector** — needed for connector-link update:
   ```bash
   # Ensure tunnel is running on port 15432, then:
   docker run -d --name banyan_pg_connector \
     -p 7892:8080 \
     -e 'CONNECTION_URI=<url-with-host.docker.internal:15432>' \
     -e 'HASURA_SERVICE_TOKEN_SECRET=<from .env>' \
     -v $(pwd)/hasura/ddn/app/connector/banyan_pg:/etc/connector:ro \
     ghcr.io/hasura/ndc-postgres:v3.1.0
   ```

3. **Update connector link and add models**:
   ```bash
   cd hasura/ddn
   ddn connector-link update banyan_pg --subgraph ./app/subgraph.yaml --add-all-resources
   ```
   This updates `banyan_pg.hml` (DataConnectorLink schema) and generates model/command/relationship HML files for new tables.

4. **Add permissions** — edit the generated `<ModelName>.hml` to add `ModelPermissions` and `TypePermissions` for each role beyond admin.

5. **Validate locally**:
   ```bash
   cd hasura/ddn && ddn supergraph build local
   ```

### Phase 3: Deploy to DDN Cloud

```bash
AWS_PROFILE=banyan bun run hasura:deploy
```

This fetches secrets from AWS SSM, generates a temp `.env.cloud`, builds and deploys, then cleans up. No secrets are stored in files.

Verify on the DDN Cloud console: `https://console.hasura.io/project/banyan-prod`

### Phase 4: Verify

Test the new table via GraphQL:
```bash
curl -s https://banyan-prod.ddn.hasura.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"query":"{ <newTable>(limit: 5) { id } }"}'
```
