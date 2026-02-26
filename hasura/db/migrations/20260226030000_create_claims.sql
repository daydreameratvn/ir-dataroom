-- migrate:up

-- Enum table: claim_statuses
CREATE TABLE claim_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO claim_statuses (value, comment) VALUES
  ('submitted', 'Claim has been submitted'),
  ('under_review', 'Claim is under manual review'),
  ('ai_processing', 'Claim is being processed by AI agents'),
  ('adjudicated', 'Claim has been adjudicated'),
  ('approved', 'Claim has been fully approved'),
  ('partially_approved', 'Claim has been partially approved'),
  ('denied', 'Claim has been denied'),
  ('appealed', 'Claim denial has been appealed'),
  ('settled', 'Claim has been settled and paid'),
  ('closed', 'Claim has been closed');

-- Table: claims
-- NOTE: provider_id FK is added in migration 4 after the providers table is created.
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  claim_number TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  policy_id UUID,
  claimant_name TEXT NOT NULL,
  provider_name TEXT,
  provider_id UUID,
  amount_claimed NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_approved NUMERIC(15,2),
  amount_paid NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  date_of_loss TIMESTAMPTZ,
  date_of_service TIMESTAMPTZ,
  submitted_by UUID,
  assigned_to UUID,
  adjudicated_by UUID,
  adjudicated_at TIMESTAMPTZ,
  denial_reason TEXT,
  ai_summary TEXT,
  ai_score NUMERIC(5,2),
  ai_recommendation TEXT,
  CONSTRAINT claims_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claims_status_fkey FOREIGN KEY (status) REFERENCES claim_statuses(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claims_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claims_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claims_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claims_adjudicated_by_fkey FOREIGN KEY (adjudicated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_claims_tenant_claim_number ON claims (tenant_id, claim_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_claims_tenant_id ON claims (tenant_id);
CREATE INDEX idx_claims_status ON claims (status);
CREATE INDEX idx_claims_policy_id ON claims (policy_id);
CREATE INDEX idx_claims_deleted_at ON claims (deleted_at);
CREATE INDEX idx_claims_claimant_name ON claims (claimant_name);
CREATE INDEX idx_claims_assigned_to ON claims (assigned_to);

-- Table: claim_diagnoses (replaces JSONB diagnosis_codes)
CREATE TABLE claim_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  claim_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sequence_number INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT claim_diagnoses_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_diagnoses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_claim_diagnoses_claim_id ON claim_diagnoses (claim_id);
CREATE INDEX idx_claim_diagnoses_tenant_id ON claim_diagnoses (tenant_id);
CREATE INDEX idx_claim_diagnoses_code ON claim_diagnoses (code);
CREATE INDEX idx_claim_diagnoses_deleted_at ON claim_diagnoses (deleted_at);

-- Table: claim_procedures (replaces JSONB procedure_codes)
CREATE TABLE claim_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  claim_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sequence_number INT NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(15,2),
  total_cost NUMERIC(15,2),
  CONSTRAINT claim_procedures_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_procedures_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_claim_procedures_claim_id ON claim_procedures (claim_id);
CREATE INDEX idx_claim_procedures_tenant_id ON claim_procedures (tenant_id);
CREATE INDEX idx_claim_procedures_code ON claim_procedures (code);
CREATE INDEX idx_claim_procedures_deleted_at ON claim_procedures (deleted_at);

-- Table: claim_documents
CREATE TABLE claim_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  claim_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  document_type TEXT,
  uploaded_by UUID,
  extracted_text TEXT,
  extracted_amount NUMERIC(15,2),
  extracted_date TIMESTAMPTZ,
  extraction_confidence NUMERIC(5,2),
  CONSTRAINT claim_documents_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_claim_documents_claim_id ON claim_documents (claim_id);
CREATE INDEX idx_claim_documents_tenant_id ON claim_documents (tenant_id);
CREATE INDEX idx_claim_documents_deleted_at ON claim_documents (deleted_at);

-- Table: claim_notes
CREATE TABLE claim_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  claim_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  author_id UUID,
  agent_name TEXT,
  content TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'comment',
  visibility TEXT NOT NULL DEFAULT 'internal',
  CONSTRAINT claim_notes_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT claim_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_claim_notes_claim_id ON claim_notes (claim_id);
CREATE INDEX idx_claim_notes_tenant_id ON claim_notes (tenant_id);
CREATE INDEX idx_claim_notes_deleted_at ON claim_notes (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
