-- migrate:up

-- Add missing deleted_by audit column to all auth tables
-- Per project convention, every table MUST have all 6 audit columns

ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE auth_otp_requests ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE auth_passkeys ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- migrate:down

ALTER TABLE auth_identities DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE auth_sessions DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE auth_otp_requests DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE auth_passkeys DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE auth_login_attempts DROP COLUMN IF EXISTS deleted_by;
