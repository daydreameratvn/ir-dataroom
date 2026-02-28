-- migrate:up

-- ── Enum table: identity provider types ──
CREATE TABLE identity_provider_types (
  value   TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO identity_provider_types (value, comment) VALUES
  ('google_workspace', 'Google Workspace Directory'),
  ('microsoft_entra',  'Microsoft Entra ID (future)'),
  ('okta',             'Okta (future)');

-- ── Tenant identity providers ──
CREATE TABLE tenant_identity_providers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  provider_type           TEXT NOT NULL REFERENCES identity_provider_types(value),
  display_name            TEXT NOT NULL,

  -- Domain auto-join config
  domains                 TEXT[] NOT NULL DEFAULT '{}',
  auto_join_enabled       BOOLEAN NOT NULL DEFAULT false,
  auto_join_user_type     TEXT REFERENCES user_types(value),
  auto_join_user_level    TEXT REFERENCES user_levels(value),

  -- Auto offboarding
  auto_offboard_enabled   BOOLEAN NOT NULL DEFAULT false,

  -- Google OAuth credentials (encrypted)
  encrypted_refresh_token TEXT,
  admin_email             TEXT,
  google_customer_id      TEXT,

  -- Sync state
  last_sync_at            TIMESTAMPTZ,
  last_sync_status        TEXT,
  last_sync_error         TEXT,

  -- Active flag
  is_active               BOOLEAN NOT NULL DEFAULT true,

  -- Audit columns
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  created_by              UUID REFERENCES users(id),
  updated_by              UUID REFERENCES users(id),
  deleted_by              UUID REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_tenant_identity_providers_tenant_type
  ON tenant_identity_providers (tenant_id, provider_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tenant_identity_providers_domains
  ON tenant_identity_providers USING GIN (domains);

CREATE INDEX idx_tenant_identity_providers_deleted_at
  ON tenant_identity_providers (deleted_at);

-- ── Directory sync logs ──
CREATE TABLE directory_sync_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  provider_id         UUID NOT NULL REFERENCES tenant_identity_providers(id),

  -- Trigger info
  trigger_type        TEXT NOT NULL,  -- manual | scheduled | auto_join
  triggered_by        UUID REFERENCES users(id),

  -- Status
  status              TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | success | failed | partial

  -- Counts
  users_fetched       INT NOT NULL DEFAULT 0,
  users_created       INT NOT NULL DEFAULT 0,
  users_updated       INT NOT NULL DEFAULT 0,
  users_deactivated   INT NOT NULL DEFAULT 0,
  users_skipped       INT NOT NULL DEFAULT 0,
  errors_count        INT NOT NULL DEFAULT 0,

  -- Timing
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INT,

  -- Error details
  error_message       TEXT,
  error_details       JSONB,
  change_log          JSONB,

  -- Audit columns
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  updated_by          UUID REFERENCES users(id),
  deleted_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_directory_sync_logs_provider
  ON directory_sync_logs (provider_id, started_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_directory_sync_logs_tenant
  ON directory_sync_logs (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_directory_sync_logs_deleted_at
  ON directory_sync_logs (deleted_at);

-- ── Add directory sync columns to users ──
ALTER TABLE users
  ADD COLUMN directory_sync_id    TEXT,
  ADD COLUMN directory_provider_id UUID REFERENCES tenant_identity_providers(id);

CREATE INDEX idx_users_directory_sync
  ON users (directory_sync_id, directory_provider_id)
  WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_users_directory_sync;
ALTER TABLE users
  DROP COLUMN IF EXISTS directory_sync_id,
  DROP COLUMN IF EXISTS directory_provider_id;

DROP TABLE IF EXISTS directory_sync_logs;
DROP TABLE IF EXISTS tenant_identity_providers;
DROP TABLE IF EXISTS identity_provider_types;
