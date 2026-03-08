-- migrate:up

-- Enum table: policy_rule_set_statuses
CREATE TABLE policy_rule_set_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO policy_rule_set_statuses (value, comment) VALUES
  ('draft', 'Freshly extracted, awaiting human review'),
  ('reviewed', 'Human has reviewed and confirmed rules'),
  ('active', 'Rules are live and available to Drone'),
  ('archived', 'Superseded by a newer extraction');

-- 1. One rule set per insurer × product/policy combination
CREATE TABLE policy_rule_sets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  insurer_name    TEXT NOT NULL,
  product_name    TEXT,
  policy_number   TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  effective_date  TIMESTAMPTZ,
  expiry_date     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_by      UUID REFERENCES users(id),
  CONSTRAINT policy_rule_sets_status_fkey FOREIGN KEY (status) REFERENCES policy_rule_set_statuses(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_prs_insurer    ON policy_rule_sets (insurer_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_prs_policy     ON policy_rule_sets (policy_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_prs_status     ON policy_rule_sets (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_prs_deleted_at ON policy_rule_sets (deleted_at);

-- 2. Source documents that fed into this rule set
CREATE TABLE policy_rule_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id       UUID NOT NULL REFERENCES policy_rule_sets(id),
  drive_file_id     TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_category     TEXT NOT NULL,
  drive_folder_path TEXT[],
  page_count        INT,
  extracted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text          TEXT,
  extraction_model  TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  deleted_by        UUID REFERENCES users(id)
);

CREATE INDEX idx_prsrc_ruleset    ON policy_rule_sources (rule_set_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_prsrc_drive      ON policy_rule_sources (drive_file_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_prsrc_deleted_at ON policy_rule_sources (deleted_at);

-- Enum table: policy_rule_categories
CREATE TABLE policy_rule_categories (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO policy_rule_categories (value, comment) VALUES
  ('benefit_schedule', 'Benefit limits and sub-limits'),
  ('exclusion', 'Excluded conditions, drugs, or procedures'),
  ('drug_rule', 'Drug registration, formulary, generic substitution rules'),
  ('test_rule', 'Diagnostic test coverage rules'),
  ('copay', 'Copay/co-insurance rates'),
  ('deductible', 'Deductible amounts'),
  ('waiting_period', 'Waiting period durations'),
  ('network', 'Provider network requirements'),
  ('authorization', 'Pre-authorization requirements'),
  ('special_clause', 'Special clauses (maternity, dental frequency, etc.)'),
  ('general_condition', 'General policy conditions'),
  ('amendment_override', 'Amendment overrides to base rules');

-- 3. Individual extracted rules — the core queryable data
CREATE TABLE policy_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id   UUID NOT NULL REFERENCES policy_rule_sets(id),
  source_id     UUID REFERENCES policy_rule_sources(id),
  category      TEXT NOT NULL,
  benefit_type  TEXT,
  rule_key      TEXT NOT NULL,
  rule_value    JSONB NOT NULL,
  description   TEXT NOT NULL,
  source_page   INT,
  source_text   TEXT,
  priority      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  deleted_by    UUID REFERENCES users(id),
  CONSTRAINT policy_rules_category_fkey FOREIGN KEY (category) REFERENCES policy_rule_categories(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_pr_ruleset    ON policy_rules (rule_set_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_category   ON policy_rules (rule_set_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_benefit    ON policy_rules (rule_set_id, benefit_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_key        ON policy_rules (rule_set_id, rule_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_source     ON policy_rules (source_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_deleted_at ON policy_rules (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
