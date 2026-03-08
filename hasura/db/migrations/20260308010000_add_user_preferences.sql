-- migrate:up
ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.preferences IS 'User preferences (onboarding flags, UI settings). Extensible JSONB.';

-- migrate:down
ALTER TABLE users DROP COLUMN preferences;
