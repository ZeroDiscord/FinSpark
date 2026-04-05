-- Migration 009: licenses

CREATE TABLE IF NOT EXISTS tenant_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    l2_module VARCHAR(255) NOT NULL,
    l3_feature VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_licenses ON tenant_licenses(tenant_id, l3_feature);
