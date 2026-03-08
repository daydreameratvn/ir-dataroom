-- migrate:up

-- Enum: member statuses
CREATE TABLE member_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO member_statuses (value, comment) VALUES
  ('invited', 'Member has been invited but has not yet joined'),
  ('active', 'Member has joined and is active'),
  ('suspended', 'Member has been suspended by an admin'),
  ('removed', 'Member has been removed from the tenant');

-- Enum: member sources
CREATE TABLE member_sources (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO member_sources (value, comment) VALUES
  ('manual', 'Manually invited by an admin'),
  ('csv', 'Imported from CSV/Excel file'),
  ('google_workspace', 'Synced from Google Workspace'),
  ('microsoft_365', 'Synced from Microsoft 365'),
  ('domain_auto_admit', 'Auto-admitted via domain matching');

-- Table: tenant_members
CREATE TABLE tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  tenant_id UUID NOT NULL,
  user_id UUID,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  source TEXT NOT NULL DEFAULT 'manual',
  invited_by UUID,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  CONSTRAINT tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT tenant_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT tenant_members_status_fkey FOREIGN KEY (status) REFERENCES member_statuses(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT tenant_members_source_fkey FOREIGN KEY (source) REFERENCES member_sources(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_tenant_members_tenant_id ON tenant_members (tenant_id);
CREATE INDEX idx_tenant_members_deleted_at ON tenant_members (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_members_status ON tenant_members (status);
CREATE UNIQUE INDEX idx_tenant_members_tenant_email ON tenant_members (tenant_id, email) WHERE deleted_at IS NULL;

-- Table: tenant_domains
CREATE TABLE tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  tenant_id UUID NOT NULL,
  domain TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  auto_admit BOOLEAN NOT NULL DEFAULT false,
  verification_token TEXT,
  CONSTRAINT tenant_domains_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_tenant_domains_tenant_id ON tenant_domains (tenant_id);
CREATE INDEX idx_tenant_domains_deleted_at ON tenant_domains (deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_tenant_domains_tenant_domain ON tenant_domains (tenant_id, domain) WHERE deleted_at IS NULL;

-- Table: tenant_activity_logs
CREATE TABLE tenant_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  description TEXT,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT tenant_activity_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT tenant_activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_tenant_activity_logs_tenant_id ON tenant_activity_logs (tenant_id);
CREATE INDEX idx_tenant_activity_logs_deleted_at ON tenant_activity_logs (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_activity_logs_actor_id ON tenant_activity_logs (actor_id);
CREATE INDEX idx_tenant_activity_logs_created_at ON tenant_activity_logs (created_at DESC);
CREATE INDEX idx_tenant_activity_logs_action ON tenant_activity_logs (action);

-- migrate:down

DROP TABLE IF EXISTS tenant_activity_logs;
DROP TABLE IF EXISTS tenant_domains;
DROP TABLE IF EXISTS tenant_members;
DROP TABLE IF EXISTS member_sources;
DROP TABLE IF EXISTS member_statuses;
