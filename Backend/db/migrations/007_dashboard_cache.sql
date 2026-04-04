-- Migration 007: dashboard_cache

CREATE TABLE IF NOT EXISTS dashboard_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cache_key   VARCHAR(255) NOT NULL,
  payload     JSONB NOT NULL,
  cached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INTEGER NOT NULL DEFAULT 300,
  UNIQUE(tenant_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_cache_tenant_key ON dashboard_cache(tenant_id, cache_key);
