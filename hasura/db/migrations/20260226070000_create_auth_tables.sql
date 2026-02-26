-- migrate:up

-- ============================================================
-- Auth Providers (enum table)
-- ============================================================

CREATE TABLE auth_providers (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO auth_providers (value, comment) VALUES
  ('google', 'Google OAuth 2.0 / OpenID Connect'),
  ('microsoft', 'Microsoft Entra ID / OpenID Connect'),
  ('apple', 'Apple Sign In / OpenID Connect'),
  ('email_otp', 'Email one-time password'),
  ('phone_otp', 'Phone SMS one-time password'),
  ('passkey', 'WebAuthn / FIDO2 passkey');

-- ============================================================
-- Auth Identities — links users to auth methods
-- ============================================================

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,

  CONSTRAINT auth_identities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_identities_provider_fkey FOREIGN KEY (provider) REFERENCES auth_providers(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_auth_identities_tenant_provider_user ON auth_identities (tenant_id, provider, provider_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_identities_tenant_id ON auth_identities (tenant_id);
CREATE INDEX idx_auth_identities_user_id ON auth_identities (user_id);
CREATE INDEX idx_auth_identities_deleted_at ON auth_identities (deleted_at);

-- ============================================================
-- Auth Sessions — refresh token sessions
-- ============================================================

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address TEXT,

  CONSTRAINT auth_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_auth_sessions_token_hash ON auth_sessions (token_hash) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_sessions_tenant_id ON auth_sessions (tenant_id);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions (expires_at);
CREATE INDEX idx_auth_sessions_deleted_at ON auth_sessions (deleted_at);

-- ============================================================
-- Auth OTP Requests — pending OTP verifications
-- ============================================================

CREATE TABLE auth_otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,
  destination TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,

  CONSTRAINT auth_otp_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_otp_requests_provider_fkey FOREIGN KEY (provider) REFERENCES auth_providers(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_auth_otp_requests_tenant_id ON auth_otp_requests (tenant_id);
CREATE INDEX idx_auth_otp_requests_destination ON auth_otp_requests (tenant_id, destination) WHERE deleted_at IS NULL AND verified_at IS NULL;
CREATE INDEX idx_auth_otp_requests_expires_at ON auth_otp_requests (expires_at);
CREATE INDEX idx_auth_otp_requests_deleted_at ON auth_otp_requests (deleted_at);

-- ============================================================
-- Auth Passkeys — WebAuthn credentials
-- ============================================================

CREATE TABLE auth_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  sign_count INT NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT,
  last_used_at TIMESTAMPTZ,

  CONSTRAINT auth_passkeys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_auth_passkeys_credential_id ON auth_passkeys (credential_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_passkeys_tenant_id ON auth_passkeys (tenant_id);
CREATE INDEX idx_auth_passkeys_user_id ON auth_passkeys (user_id);
CREATE INDEX idx_auth_passkeys_deleted_at ON auth_passkeys (deleted_at);

-- ============================================================
-- Auth Login Attempts — security audit trail
-- ============================================================

CREATE TABLE auth_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL,
  user_id UUID,
  provider TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT,

  CONSTRAINT auth_login_attempts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT auth_login_attempts_provider_fkey FOREIGN KEY (provider) REFERENCES auth_providers(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_auth_login_attempts_tenant_id ON auth_login_attempts (tenant_id);
CREATE INDEX idx_auth_login_attempts_user_id ON auth_login_attempts (user_id);
CREATE INDEX idx_auth_login_attempts_created_at ON auth_login_attempts (created_at);
CREATE INDEX idx_auth_login_attempts_deleted_at ON auth_login_attempts (deleted_at);

-- ============================================================
-- Additive change: add phone column to users
-- ============================================================

ALTER TABLE users ADD COLUMN phone TEXT;

-- migrate:down
-- no rollback, write a new migration instead
