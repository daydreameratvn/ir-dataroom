-- migrate:up

-- Add can_impersonate flag to users table.
-- Controls which users are allowed to impersonate others.
-- Separate from is_impersonatable which controls who CAN BE impersonated.
ALTER TABLE users ADD COLUMN can_impersonate BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_users_can_impersonate ON users (can_impersonate) WHERE can_impersonate = true;

-- migrate:down
