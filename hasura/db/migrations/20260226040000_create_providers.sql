-- migrate:up

-- Enum table: provider_specialties
CREATE TABLE provider_specialties (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO provider_specialties (value, comment) VALUES
  ('general', 'General practitioner'),
  ('hospital', 'Hospital facility'),
  ('clinic', 'Outpatient clinic'),
  ('dental', 'Dental care provider'),
  ('optical', 'Optical and vision care'),
  ('pharmacy', 'Pharmacy'),
  ('laboratory', 'Diagnostic laboratory'),
  ('radiology', 'Radiology and imaging'),
  ('rehabilitation', 'Rehabilitation services'),
  ('mental_health', 'Mental health services'),
  ('specialist', 'Medical specialist'),
  ('emergency', 'Emergency services');

-- Table: providers
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  provider_code TEXT NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT,
  license_number TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  network_status TEXT NOT NULL DEFAULT 'in_network',
  active BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(3,2),
  CONSTRAINT providers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT providers_specialty_fkey FOREIGN KEY (specialty) REFERENCES provider_specialties(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT providers_country_fkey FOREIGN KEY (country) REFERENCES nationalities(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_providers_tenant_provider_code ON providers (tenant_id, provider_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_providers_tenant_id ON providers (tenant_id);
CREATE INDEX idx_providers_specialty ON providers (specialty);
CREATE INDEX idx_providers_deleted_at ON providers (deleted_at);
CREATE INDEX idx_providers_country ON providers (country);

-- Table: provider_contracts
CREATE TABLE provider_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  provider_id UUID,
  contract_number TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  expiry_date TIMESTAMPTZ NOT NULL,
  discount_rate NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  payment_terms TEXT,
  auto_renewal BOOLEAN NOT NULL DEFAULT false,
  termination_notice_days INT,
  fee_schedule TEXT,
  CONSTRAINT provider_contracts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT provider_contracts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_provider_contracts_provider_id ON provider_contracts (provider_id);
CREATE INDEX idx_provider_contracts_tenant_id ON provider_contracts (tenant_id);
CREATE INDEX idx_provider_contracts_deleted_at ON provider_contracts (deleted_at);

-- Add FK constraint on claims.provider_id (column was created in migration 3 without FK)
ALTER TABLE claims
  ADD CONSTRAINT claims_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES providers(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX CONCURRENTLY idx_claims_provider_id ON claims (provider_id);

-- migrate:down
-- no rollback, write a new migration instead
