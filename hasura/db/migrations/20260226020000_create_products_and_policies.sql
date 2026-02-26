-- migrate:up

-- Enum table: product_lines
CREATE TABLE product_lines (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO product_lines (value, comment) VALUES
  ('life', 'Life insurance'),
  ('health', 'Health insurance'),
  ('property', 'Property insurance'),
  ('auto', 'Automobile insurance'),
  ('travel', 'Travel insurance'),
  ('marine', 'Marine insurance'),
  ('liability', 'Liability insurance'),
  ('group_health', 'Group health insurance'),
  ('personal_accident', 'Personal accident insurance'),
  ('critical_illness', 'Critical illness insurance');

-- Table: products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  product_line TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  max_coverage_amount NUMERIC(15,2),
  min_premium NUMERIC(15,2),
  max_premium NUMERIC(15,2),
  waiting_period_days INT,
  coverage_term_months INT,
  CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT products_product_line_fkey FOREIGN KEY (product_line) REFERENCES product_lines(value) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_products_tenant_code ON products (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_tenant_id ON products (tenant_id);
CREATE INDEX idx_products_product_line ON products (product_line);
CREATE INDEX idx_products_deleted_at ON products (deleted_at);

-- Enum table: policy_statuses
CREATE TABLE policy_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO policy_statuses (value, comment) VALUES
  ('draft', 'Policy is in draft state'),
  ('active', 'Policy is active and in force'),
  ('expired', 'Policy has expired'),
  ('cancelled', 'Policy has been cancelled'),
  ('suspended', 'Policy is temporarily suspended'),
  ('pending_renewal', 'Policy is pending renewal'),
  ('lapsed', 'Policy has lapsed due to non-payment');

-- Table: policies
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  policy_number TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  product_id UUID,
  insured_name TEXT NOT NULL,
  insured_id_number TEXT,
  insured_email TEXT,
  insured_phone TEXT,
  insured_date_of_birth TIMESTAMPTZ,
  insured_address TEXT,
  effective_date TIMESTAMPTZ NOT NULL,
  expiry_date TIMESTAMPTZ NOT NULL,
  premium NUMERIC(15,2) NOT NULL DEFAULT 0,
  sum_insured NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  deductible NUMERIC(15,2) DEFAULT 0,
  copay_percentage NUMERIC(5,2),
  issued_by UUID,
  renewal_of UUID,
  notes TEXT,
  CONSTRAINT policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT policies_status_fkey FOREIGN KEY (status) REFERENCES policy_statuses(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT policies_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT policies_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT policies_renewal_of_fkey FOREIGN KEY (renewal_of) REFERENCES policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_policies_tenant_policy_number ON policies (tenant_id, policy_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_policies_tenant_id ON policies (tenant_id);
CREATE INDEX idx_policies_status ON policies (status);
CREATE INDEX idx_policies_product_id ON policies (product_id);
CREATE INDEX idx_policies_deleted_at ON policies (deleted_at);
CREATE INDEX idx_policies_insured_name ON policies (insured_name);
CREATE INDEX idx_policies_renewal_of ON policies (renewal_of);

-- Enum table: endorsement_types
CREATE TABLE endorsement_types (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO endorsement_types (value, comment) VALUES
  ('amendment', 'Policy amendment or modification'),
  ('cancellation', 'Policy cancellation endorsement'),
  ('reinstatement', 'Policy reinstatement'),
  ('renewal', 'Policy renewal endorsement'),
  ('rider', 'Additional rider or benefit');

-- Enum table: endorsement_statuses
CREATE TABLE endorsement_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO endorsement_statuses (value, comment) VALUES
  ('draft', 'Endorsement is in draft'),
  ('pending', 'Endorsement is pending approval'),
  ('approved', 'Endorsement has been approved'),
  ('applied', 'Endorsement has been applied to the policy'),
  ('rejected', 'Endorsement has been rejected');

-- Table: endorsements
CREATE TABLE endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  endorsement_number TEXT NOT NULL,
  policy_id UUID,
  endorsement_type TEXT,
  status TEXT DEFAULT 'draft',
  description TEXT,
  effective_date TIMESTAMPTZ,
  premium_adjustment NUMERIC(15,2) DEFAULT 0,
  sum_insured_adjustment NUMERIC(15,2) DEFAULT 0,
  requested_by UUID,
  approved_by UUID,
  rejection_reason TEXT,
  CONSTRAINT endorsements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT endorsements_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT endorsements_endorsement_type_fkey FOREIGN KEY (endorsement_type) REFERENCES endorsement_types(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT endorsements_status_fkey FOREIGN KEY (status) REFERENCES endorsement_statuses(value) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT endorsements_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT endorsements_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX idx_endorsements_tenant_endorsement_number ON endorsements (tenant_id, endorsement_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_endorsements_tenant_id ON endorsements (tenant_id);
CREATE INDEX idx_endorsements_policy_id ON endorsements (policy_id);
CREATE INDEX idx_endorsements_deleted_at ON endorsements (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
