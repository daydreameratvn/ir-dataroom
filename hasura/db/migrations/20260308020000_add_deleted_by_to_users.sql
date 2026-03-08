-- migrate:up

-- Add missing deleted_by audit column to users table
-- Per project convention, every table MUST have all 6 audit columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- migrate:down

ALTER TABLE users DROP COLUMN IF EXISTS deleted_by;
