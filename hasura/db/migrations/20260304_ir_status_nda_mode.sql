-- migrate:up

-- Add new statuses to enum table
INSERT INTO ir_investor_statuses (value, comment) VALUES
  ('nda_signed', 'Investor has signed NDA (digital or offline)'),
  ('viewing', 'Investor is actively viewing/downloading documents'),
  ('docs_signed', 'Final closing documents signed')
ON CONFLICT (value) DO NOTHING;

-- Add nda_mode column (default 'digital')
ALTER TABLE ir_investor_rounds
  ADD COLUMN IF NOT EXISTS nda_mode TEXT NOT NULL DEFAULT 'digital';

-- Migrate existing data:
-- nda_accepted → nda_signed
UPDATE ir_investor_rounds SET status = 'nda_signed' WHERE status = 'nda_accepted' AND deleted_at IS NULL;
-- active → viewing
UPDATE ir_investor_rounds SET status = 'viewing' WHERE status = 'active' AND deleted_at IS NULL;

-- For investors where nda_required=false (current "skip NDA"), set nda_mode='offline'
UPDATE ir_investor_rounds SET nda_mode = 'offline' WHERE nda_required = false AND deleted_at IS NULL;

-- migrate:down
ALTER TABLE ir_investor_rounds DROP COLUMN IF EXISTS nda_mode;
