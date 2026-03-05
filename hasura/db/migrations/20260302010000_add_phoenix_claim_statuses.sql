-- migrate:up

-- Add new claim statuses for Phoenix (TechcomLife) claims portal
INSERT INTO claim_statuses (value, comment) VALUES
  ('pending_review', 'Claim submitted, awaiting initial review (Chờ thẩm định)'),
  ('additional_docs_required', 'Additional documents requested from policyholder (Yêu cầu nộp bổ sung)')
ON CONFLICT (value) DO NOTHING;

-- migrate:down
-- no rollback, write a new migration instead
