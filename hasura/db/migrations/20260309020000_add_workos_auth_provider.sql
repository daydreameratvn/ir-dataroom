-- migrate:up
-- Add WorkOS as an authentication provider for AuthKit integration

INSERT INTO auth_providers (value, comment) VALUES
  ('workos', 'WorkOS AuthKit (SSO, email, passkey, magic auth)')
ON CONFLICT (value) DO NOTHING;

-- migrate:down
DELETE FROM auth_providers WHERE value = 'workos';
