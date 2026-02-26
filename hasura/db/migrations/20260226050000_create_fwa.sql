-- migrate:up

-- Enum table: fwa_severities
CREATE TABLE fwa_severities (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO fwa_severities (value, comment) VALUES
  ('low', 'Low severity — informational'),
  ('medium', 'Medium severity — requires review'),
  ('high', 'High severity — urgent attention needed'),
  ('critical', 'Critical severity — immediate action required');

-- Table: fwa_rules
CREATE TABLE fwa_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  rule_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium',
  rule_type TEXT NOT NULL DEFAULT 'pattern',
  active BOOLEAN NOT NULL DEFAULT true,
  threshold_amount NUMERIC(15,2),
  threshold_count INT,
  time_window_days INT,
  pattern TEXT,
  target_entity TEXT,
  CONSTRAINT fwa_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_rules_severity_fkey FOREIGN KEY (severity) REFERENCES fwa_severities(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_fwa_rules_tenant_rule_code ON fwa_rules (tenant_id, rule_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_fwa_rules_tenant_id ON fwa_rules (tenant_id);
CREATE INDEX idx_fwa_rules_deleted_at ON fwa_rules (deleted_at);

-- Table: fwa_alerts
CREATE TABLE fwa_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  alert_number TEXT NOT NULL,
  rule_id UUID,
  severity TEXT,
  claim_id UUID,
  provider_id UUID,
  policy_id UUID,
  score NUMERIC(5,2),
  description TEXT,
  ai_analysis TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  CONSTRAINT fwa_alerts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES fwa_rules(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_severity_fkey FOREIGN KEY (severity) REFERENCES fwa_severities(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fwa_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_fwa_alerts_tenant_alert_number ON fwa_alerts (tenant_id, alert_number);
CREATE INDEX idx_fwa_alerts_tenant_id ON fwa_alerts (tenant_id);
CREATE INDEX idx_fwa_alerts_rule_id ON fwa_alerts (rule_id);
CREATE INDEX idx_fwa_alerts_claim_id ON fwa_alerts (claim_id);
CREATE INDEX idx_fwa_alerts_provider_id ON fwa_alerts (provider_id);
CREATE INDEX idx_fwa_alerts_severity ON fwa_alerts (severity);
CREATE INDEX idx_fwa_alerts_status ON fwa_alerts (status);
CREATE INDEX idx_fwa_alerts_deleted_at ON fwa_alerts (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
