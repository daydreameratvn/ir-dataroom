-- migrate:up

-- Enum table: user_types
CREATE TABLE user_types (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO user_types (value, comment) VALUES
  ('insurer', 'Insurance company user'),
  ('broker', 'Insurance broker'),
  ('provider', 'Healthcare or service provider user'),
  ('papaya', 'Papaya internal user');

-- Enum table: user_levels
CREATE TABLE user_levels (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO user_levels (value, comment) VALUES
  ('admin', 'Full system administrator'),
  ('executive', 'Executive-level access'),
  ('manager', 'Manager-level access'),
  ('staff', 'Standard staff access'),
  ('viewer', 'Read-only access');

-- Table: users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  user_type TEXT NOT NULL,
  user_level TEXT NOT NULL,
  title TEXT,
  department TEXT,
  locale TEXT DEFAULT 'en',
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT users_user_type_fkey FOREIGN KEY (user_type) REFERENCES user_types(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT users_user_level_fkey FOREIGN KEY (user_level) REFERENCES user_levels(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_users_tenant_email ON users (tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_tenant_id ON users (tenant_id);
CREATE INDEX idx_users_deleted_at ON users (deleted_at);
CREATE INDEX idx_users_user_type ON users (user_type);

-- migrate:down
-- no rollback, write a new migration instead
