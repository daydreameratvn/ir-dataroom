---
name: hasura
description: |
  Hasura database, permissions, naming, and table conventions for Banyan.
  Use when working with: database schema, migrations (dbmate), OpenDD metadata
  (open_dd.json), permissions (ModelPermissions, TypePermissions, CommandPermissions),
  relationships, NDC PostgreSQL connector, or any Hasura DDN v3 supergraph modeling.
  Triggers on: SQL migrations, metadata JSON edits, permission definitions, new tables/models,
  GraphQL schema changes, connector configuration.
---

# Hasura DDN v3 Conventions

Conventions for database schema, OpenDD metadata, and permissions in Banyan.

**Architecture**: Hasura DDN v3 with NDC PostgreSQL connector (`banyan_pg`). No DDN CLI — metadata is plain JSON in `hasura/metadata/`. Migrations use dbmate (raw SQL). See `hasura/CLAUDE.md` for commands, file structure, and migration rules.

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
- **Schema per domain** — use PostgreSQL schemas to group tables by domain. Example: `billing.invoices`, `billing.payments`. Prefixes within a schema are fine.

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

## OpenDD Metadata Conventions

Metadata lives in `hasura/metadata/open_dd.json` as an array of metadata objects. Each object has `kind`, `version`, and `definition`.

### Domain Organization

When merging multiple data sources into the supergraph, use **nested domains (sub-graphs)** — never name prefixes. Each data source or domain gets its own sub-graph namespace. The supergraph composes them without flattening.

| Layer | Correct | Wrong |
| --- | --- | --- |
| Sub-graph | sub-graph `billing` with model `Invoices` | model `BillingInvoices` in root |
| Sub-graph | sub-graph `crm` with type `Contact` | type `CrmContact` in root |
| Connector | `billing_pg` in sub-graph `billing` | single connector with prefixed names |

### Naming

| Kind | Naming | Example |
|------|--------|---------|
| `ObjectType` | PascalCase, singular | `User`, `Organization`, `ProjectMember` |
| `Model` | PascalCase, plural | `Users`, `Organizations`, `ProjectMembers` |
| `Relationship` | camelCase | `author`, `articles`, `projectMembers` |
| `BooleanExpressionType` | `{Type}_bool_exp` | `User_bool_exp`, `Article_bool_exp` |
| `Command` | camelCase verb phrase | `createUser`, `deleteDocument` |
| `DataConnectorLink` | snake_case | `banyan_pg` |

### Field Naming

- **Data-source fields**: Use snake_case matching the database column name. No renaming — respect the data source.
- **Custom fields** (computed fields, derived values not backed by a column): Use camelCase.
- **Sub-graph fields**: Respect the field name from the sub-graph source.

```json
{
  "kind": "ObjectType",
  "version": "v1",
  "definition": {
    "name": "User",
    "fields": [
      { "name": "user_id", "type": "Uuid!" },
      { "name": "created_at", "type": "Timestamptz!" },
      { "name": "fullName", "type": "String" }
    ],
    "dataConnectorTypeMapping": [{
      "dataConnectorName": "banyan_pg",
      "dataConnectorObjectType": "users",
      "fieldMapping": {
        "user_id": { "column": { "name": "user_id" } },
        "created_at": { "column": { "name": "created_at" } }
      }
    }]
  }
}
```

`user_id` and `created_at` are snake_case (from database). `fullName` is camelCase (computed, not a column).

### Model GraphQL Root Fields

Use camelCase for query root fields:

```json
{
  "kind": "Model",
  "version": "v2",
  "definition": {
    "name": "Users",
    "objectType": "User",
    "source": { "dataConnectorName": "banyan_pg", "collection": "users" },
    "graphql": {
      "selectMany": { "queryRootField": "users" },
      "selectUniques": [{ "queryRootField": "userById", "uniqueIdentifier": ["user_id"] }]
    }
  }
}
```

### Relationships

Define as standalone metadata objects. Use `Object` for single (many-to-one) and `Array` for multiple (one-to-many):

```json
{
  "kind": "Relationship",
  "version": "v1",
  "definition": {
    "name": "author",
    "sourceType": "Article",
    "target": {
      "model": { "name": "Users", "relationshipType": "Object" }
    },
    "mapping": [{
      "source": { "fieldPath": [{ "fieldName": "author_id" }] },
      "target": { "modelField": [{ "fieldName": "user_id" }] }
    }]
  }
}
```

## Permission Conventions

Three permission kinds. By default all access is denied — explicitly grant per role.

### ModelPermissions (row-level)

Always filter out soft-deleted records:

```json
{
  "kind": "ModelPermissions",
  "version": "v1",
  "definition": {
    "modelName": "Users",
    "permissions": [
      { "role": "admin", "select": { "filter": null } },
      {
        "role": "user",
        "select": {
          "filter": {
            "and": [
              { "fieldIsNull": { "field": "deleted_at", "negate": true } },
              { "fieldComparison": { "field": "user_id", "operator": "_eq", "value": { "sessionVariable": "x-hasura-user-id" } } }
            ]
          }
        }
      }
    ]
  }
}
```

- `admin` role: `"filter": null` (unrestricted).
- All other roles: always include `deleted_at IS NULL` check under `and` for extensibility.
- Filter deleted related objects in nested permissions to prevent null reference errors at runtime.

### TypePermissions (field-level)

Restrict sensitive fields per role:

```json
{
  "kind": "TypePermissions",
  "version": "v1",
  "definition": {
    "typeName": "User",
    "permissions": [
      { "role": "admin", "output": { "allowedFields": ["user_id", "email", "created_at", "deleted_at"] } },
      { "role": "user", "output": { "allowedFields": ["user_id", "email", "created_at"] } }
    ]
  }
}
```

- Never expose `deleted_at`, `deleted_by` to non-admin roles.
- `created_by`, `updated_by` — expose only when needed.

### CommandPermissions (mutation-level)

```json
{
  "kind": "CommandPermissions",
  "version": "v1",
  "definition": {
    "commandName": "deleteDocument",
    "permissions": [
      { "role": "admin", "allowExecution": true },
      { "role": "user", "allowExecution": true, "argumentPresets": [{
        "argument": "preCheck",
        "value": { "booleanExpression": {
          "fieldComparison": { "field": "owner_id", "operator": "_eq", "value": { "sessionVariable": "x-hasura-user-id" } }
        }}
      }]}
    ]
  }
}
```

### JWT Claims

Session variables come from JWT claims under the `https://hasura.io/jwt/claims` namespace (JSON Pointer: `/https:~1~1hasura.io~1jwt~1claims`). Required claims:

- `x-hasura-default-role` — applied when no role override header is sent.
- `x-hasura-allowed-roles` — array of roles the token holder can assume.
- `x-hasura-user-id` — used in permission filters and column presets.

## Adding a New Table Checklist

### Phase 1: Database Migration

1. Read `hasura/db/schema.sql` to understand current schema.
2. Write dbmate migration SQL (forward-only, backward-compatible — see `hasura/CLAUDE.md`).
3. Start SSM tunnel: `AWS_PROFILE=banyan bun run hasura:tunnel` (in a separate terminal).
4. Run migration through tunnel: `AWS_PROFILE=banyan bun run hasura:migrate -- --tunnel`.

### Phase 2: Sync Hasura Metadata

After the DB schema changes, Hasura does not auto-detect them. You must update the OpenDD metadata so the engine exposes the new tables/columns via GraphQL.

1. Read `hasura/metadata/open_dd.json` to understand current metadata.
2. Add `ObjectType` with field mapping to `open_dd.json`.
3. Add `Model` with GraphQL root fields.
4. Add `Relationship` objects for foreign keys (both directions).
5. Add `BooleanExpressionType` if filtering is needed.
6. Add `ModelPermissions` (with soft-delete filter) and `TypePermissions` for each role.

### Phase 3: Deploy

Deploy uploads metadata to S3 and restarts **both** ECS services:

- **NDC connector** restarts first to introspect new DB tables/columns.
- **Engine** restarts second to load the updated OpenDD metadata.

1. Deploy and restart: `AWS_PROFILE=banyan bun run hasura:deploy`.
2. Introspect to verify: `AWS_PROFILE=banyan bun run hasura:introspect`.
