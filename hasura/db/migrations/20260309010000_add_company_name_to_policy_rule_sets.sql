-- migrate:up

-- Add company_name to policy_rule_sets for company-level rule set identification.
-- The insurer (e.g. GIC) has many client companies (e.g. TIKI, Con Cưng),
-- each with different policy terms. This column stores the policyholder company name.
ALTER TABLE policy_rule_sets ADD COLUMN company_name TEXT;

CREATE INDEX idx_prs_company ON policy_rule_sets (company_name) WHERE deleted_at IS NULL;

-- Clean up broken draft rule sets that have no company_name differentiation.
-- These were created by the old compiler that grouped all companies under one insurer.
UPDATE policy_rule_sets SET deleted_at = now(), deleted_by = NULL WHERE status = 'draft' AND company_name IS NULL;

-- migrate:down
-- no rollback, write a new migration instead
