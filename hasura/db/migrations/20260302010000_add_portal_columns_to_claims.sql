-- migrate:up

-- ─── New portal-specific claim statuses ──────────────────────────────────────

INSERT INTO claim_statuses (value, comment) VALUES
  ('pending', 'Claim created but not yet processed'),
  ('error', 'Claim processing encountered an error')
ON CONFLICT (value) DO NOTHING;

-- ─── Add portal-specific columns to claims ───────────────────────────────────

ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_type TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS is_direct_billing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS admission_date TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS discharge_date TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS has_surgery BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS amount_covered NUMERIC(15,2);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS amount_uncovered NUMERIC(15,2);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS amount_shortfall NUMERIC(15,2);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS extracted_data JSONB;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insured_dob DATE;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insured_gender TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS certificate_code TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS policy_number TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS corporate_name TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_claims_claim_type ON claims (claim_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_is_direct_billing ON claims (is_direct_billing) WHERE deleted_at IS NULL AND is_direct_billing = true;
CREATE INDEX IF NOT EXISTS idx_claims_admission_date ON claims (admission_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_certificate_code ON claims (certificate_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_policy_number ON claims (policy_number) WHERE deleted_at IS NULL;

-- ─── FWA Cases ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fwa_case_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO fwa_case_statuses (value, comment) VALUES
  ('new', 'Newly created case'),
  ('under_investigation', 'Case is being investigated'),
  ('confirmed_hit', 'Fraud confirmed'),
  ('cleared', 'Case cleared — no fraud found')
ON CONFLICT (value) DO NOTHING;

CREATE TABLE IF NOT EXISTS fwa_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  case_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' REFERENCES fwa_case_statuses(value),
  entity_type TEXT NOT NULL DEFAULT 'SINGLE_CLAIM',
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  highest_risk_score NUMERIC(5,2),
  avg_risk_score NUMERIC(5,2),
  total_flagged_amount NUMERIC(15,2),
  flag_summary JSONB DEFAULT '{}',
  ai_summary TEXT,
  ai_next_steps JSONB,
  ai_patterns TEXT,
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fwa_cases_tenant_case_code ON fwa_cases (tenant_id, case_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fwa_cases_tenant_id ON fwa_cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fwa_cases_status ON fwa_cases (status);
CREATE INDEX IF NOT EXISTS idx_fwa_cases_deleted_at ON fwa_cases (deleted_at);
CREATE INDEX IF NOT EXISTS idx_fwa_cases_entity_id ON fwa_cases (entity_id) WHERE deleted_at IS NULL;

-- ─── FWA Case Actions (timeline / notes) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS fwa_case_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  case_id UUID NOT NULL REFERENCES fwa_cases(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL DEFAULT 'NOTE',
  content TEXT NOT NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_fwa_case_actions_case_id ON fwa_case_actions (case_id);
CREATE INDEX IF NOT EXISTS idx_fwa_case_actions_tenant_id ON fwa_case_actions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fwa_case_actions_deleted_at ON fwa_case_actions (deleted_at);

-- ─── FWA Case Linked Claims (junction table) ────────────────────────────────

CREATE TABLE IF NOT EXISTS fwa_case_linked_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  case_id UUID NOT NULL REFERENCES fwa_cases(id) ON DELETE RESTRICT,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  risk_score NUMERIC(5,2),
  risk_level TEXT,
  recommendation TEXT,
  flags JSONB DEFAULT '[]',
  fwa_confirmed BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fwa_case_linked_claims_unique ON fwa_case_linked_claims (case_id, claim_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fwa_case_linked_claims_case_id ON fwa_case_linked_claims (case_id);
CREATE INDEX IF NOT EXISTS idx_fwa_case_linked_claims_claim_id ON fwa_case_linked_claims (claim_id);
CREATE INDEX IF NOT EXISTS idx_fwa_case_linked_claims_deleted_at ON fwa_case_linked_claims (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
