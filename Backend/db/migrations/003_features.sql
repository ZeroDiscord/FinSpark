-- Migration 003: features

CREATE TABLE IF NOT EXISTS features (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  upload_id       UUID REFERENCES uploads(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  l3_feature      VARCHAR(255) NOT NULL,
  l2_module       VARCHAR(255),
  l1_domain       VARCHAR(255),
  source_type     VARCHAR(20),
  confidence      DECIMAL(4,3),
  raw_identifier  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, l3_feature)
);

CREATE INDEX IF NOT EXISTS idx_features_tenant ON features(tenant_id);
