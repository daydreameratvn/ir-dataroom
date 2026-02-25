-- migrate:up

-- Enum table: nationalities (ISO 3166-1 alpha-2 codes)
CREATE TABLE nationalities (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO nationalities (value, comment) VALUES
  ('CN', 'China'),
  ('HK', 'Hong Kong'),
  ('ID', 'Indonesia'),
  ('JP', 'Japan'),
  ('KH', 'Cambodia'),
  ('KR', 'South Korea'),
  ('LA', 'Laos'),
  ('MM', 'Myanmar'),
  ('MY', 'Malaysia'),
  ('PH', 'Philippines'),
  ('SG', 'Singapore'),
  ('TH', 'Thailand'),
  ('VN', 'Vietnam');

-- Table: tenants
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  national TEXT REFERENCES nationalities(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  configuration JSONB DEFAULT jsonb_build_object()
);

CREATE INDEX idx_tenants_deleted_at ON tenants (deleted_at);
CREATE INDEX idx_tenants_national ON tenants (national);

-- migrate:down
-- no rollback, write a new migration instead
