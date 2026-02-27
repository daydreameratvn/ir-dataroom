-- migrate:up

-- =============================================================================
-- Enum table: ir_round_statuses
-- Reference data for fundraising round lifecycle states
-- =============================================================================
CREATE TABLE ir_round_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);
INSERT INTO ir_round_statuses (value, comment) VALUES
  ('draft', 'Round is being configured, not visible to investors'),
  ('active', 'Round is live and accepting investor access'),
  ('paused', 'Round is temporarily paused'),
  ('closed', 'Round is closed, no new access granted'),
  ('archived', 'Round is archived and hidden from active views');

-- =============================================================================
-- Enum table: ir_investor_statuses
-- Reference data for investor lifecycle within a round
-- =============================================================================
CREATE TABLE ir_investor_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);
INSERT INTO ir_investor_statuses (value, comment) VALUES
  ('invited', 'Investor has been invited but not yet accessed'),
  ('nda_pending', 'Investor has logged in but not yet signed NDA'),
  ('nda_accepted', 'Investor has signed NDA'),
  ('active', 'Investor is actively reviewing documents'),
  ('termsheet_sent', 'Term sheet has been sent to investor'),
  ('termsheet_signed', 'Investor has signed the term sheet'),
  ('docs_out', 'Final documents sent out'),
  ('dropped', 'Investor has dropped out of the round');

-- =============================================================================
-- Enum table: ir_document_categories
-- Reference data for document categorization
-- =============================================================================
CREATE TABLE ir_document_categories (
  value TEXT PRIMARY KEY,
  comment TEXT
);
INSERT INTO ir_document_categories (value, comment) VALUES
  ('financials', 'Financial statements, projections, models'),
  ('strategy', 'Business strategy, market analysis, competitive landscape'),
  ('product', 'Product documentation, roadmaps, demos'),
  ('legal', 'Legal documents, corporate structure, IP'),
  ('team', 'Team bios, org charts, hiring plans'),
  ('other', 'Miscellaneous documents');

-- =============================================================================
-- Table: ir_rounds
-- Fundraising rounds (Series A, B, C, etc.)
-- =============================================================================
CREATE TABLE ir_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' REFERENCES ir_round_statuses(value),
  description TEXT,
  configuration JSONB NOT NULL DEFAULT '{
    "categories": ["financials", "strategy", "product", "legal"],
    "watermarkEnabled": true,
    "ndaRequired": true,
    "allowDownload": true,
    "expiresAt": null,
    "customBranding": {"logoUrl": null, "primaryColor": null}
  }'::jsonb,
  target_raise NUMERIC,
  currency TEXT DEFAULT 'USD',
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_ir_rounds_tenant_slug ON ir_rounds (tenant_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_ir_rounds_tenant_id ON ir_rounds (tenant_id);
CREATE INDEX idx_ir_rounds_status ON ir_rounds (status);
CREATE INDEX idx_ir_rounds_created_at ON ir_rounds (created_at DESC);
CREATE INDEX idx_ir_rounds_deleted_at ON ir_rounds (deleted_at);

-- =============================================================================
-- Table: ir_investors
-- External investor profiles
-- =============================================================================
CREATE TABLE ir_investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  email TEXT NOT NULL,
  name TEXT NOT NULL,
  firm TEXT,
  title TEXT,
  phone TEXT,
  notes TEXT,
  user_id UUID REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_ir_investors_tenant_email ON ir_investors (tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_ir_investors_tenant_id ON ir_investors (tenant_id);
CREATE INDEX idx_ir_investors_email ON ir_investors (email);
CREATE INDEX idx_ir_investors_created_at ON ir_investors (created_at DESC);
CREATE INDEX idx_ir_investors_deleted_at ON ir_investors (deleted_at);

-- =============================================================================
-- Table: ir_investor_rounds
-- Join table: investor access and lifecycle per round
-- =============================================================================
CREATE TABLE ir_investor_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  investor_id UUID NOT NULL REFERENCES ir_investors(id),
  round_id UUID NOT NULL REFERENCES ir_rounds(id),
  status TEXT NOT NULL DEFAULT 'invited' REFERENCES ir_investor_statuses(value),

  nda_required BOOLEAN NOT NULL DEFAULT true,
  nda_template_id UUID,                             -- FK added after ir_nda_templates table

  invited_at TIMESTAMPTZ DEFAULT now(),
  nda_accepted_at TIMESTAMPTZ,
  nda_ip_address TEXT,
  nda_user_agent TEXT,
  last_access_at TIMESTAMPTZ,
  access_count INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_ir_investor_rounds_unique ON ir_investor_rounds (investor_id, round_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ir_investor_rounds_tenant_id ON ir_investor_rounds (tenant_id);
CREATE INDEX idx_ir_investor_rounds_investor_id ON ir_investor_rounds (investor_id);
CREATE INDEX idx_ir_investor_rounds_round_id ON ir_investor_rounds (round_id);
CREATE INDEX idx_ir_investor_rounds_status ON ir_investor_rounds (status);
CREATE INDEX idx_ir_investor_rounds_created_at ON ir_investor_rounds (created_at DESC);
CREATE INDEX idx_ir_investor_rounds_deleted_at ON ir_investor_rounds (deleted_at);

-- =============================================================================
-- Table: ir_documents
-- Files uploaded to a round's dataroom
-- =============================================================================
CREATE TABLE ir_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  round_id UUID NOT NULL REFERENCES ir_rounds(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other' REFERENCES ir_document_categories(value),
  mime_type TEXT,
  file_size_bytes BIGINT,
  s3_key TEXT,
  s3_bucket TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  watermark_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_ir_documents_tenant_id ON ir_documents (tenant_id);
CREATE INDEX idx_ir_documents_round_id ON ir_documents (round_id);
CREATE INDEX idx_ir_documents_category ON ir_documents (category);
CREATE INDEX idx_ir_documents_created_at ON ir_documents (created_at DESC);
CREATE INDEX idx_ir_documents_deleted_at ON ir_documents (deleted_at);

-- =============================================================================
-- Table: ir_nda_templates
-- NDA content per round with version tracking
-- =============================================================================
CREATE TABLE ir_nda_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  round_id UUID NOT NULL REFERENCES ir_rounds(id),
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_ir_nda_templates_tenant_id ON ir_nda_templates (tenant_id);
CREATE INDEX idx_ir_nda_templates_round_id ON ir_nda_templates (round_id);
CREATE INDEX idx_ir_nda_templates_active ON ir_nda_templates (round_id, is_active) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_ir_nda_templates_deleted_at ON ir_nda_templates (deleted_at);

-- Add FK from ir_investor_rounds.nda_template_id to ir_nda_templates
ALTER TABLE ir_investor_rounds ADD CONSTRAINT ir_investor_rounds_nda_template_id_fkey
  FOREIGN KEY (nda_template_id) REFERENCES ir_nda_templates(id);

-- =============================================================================
-- Table: ir_access_logs
-- Audit trail for all investor actions
-- =============================================================================
CREATE TABLE ir_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  investor_id UUID NOT NULL REFERENCES ir_investors(id),
  round_id UUID NOT NULL REFERENCES ir_rounds(id),
  document_id UUID REFERENCES ir_documents(id),
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  duration_seconds INT,
  metadata JSONB
);

CREATE INDEX idx_ir_access_logs_tenant_id ON ir_access_logs (tenant_id);
CREATE INDEX idx_ir_access_logs_investor_id ON ir_access_logs (investor_id);
CREATE INDEX idx_ir_access_logs_round_id ON ir_access_logs (round_id);
CREATE INDEX idx_ir_access_logs_document_id ON ir_access_logs (document_id);
CREATE INDEX idx_ir_access_logs_action ON ir_access_logs (action);
CREATE INDEX idx_ir_access_logs_created_at ON ir_access_logs (created_at DESC);
CREATE INDEX idx_ir_access_logs_deleted_at ON ir_access_logs (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
