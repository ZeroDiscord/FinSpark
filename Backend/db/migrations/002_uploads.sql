-- Migration 002: uploads

CREATE TABLE IF NOT EXISTS uploads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type         VARCHAR(20) NOT NULL CHECK (source_type IN ('apk','url','csv')),
  original_name       VARCHAR(512),
  file_path           TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'processing',
  events_ingested     INTEGER,
  schema_match_score  DECIMAL(5,4),
  warnings            JSONB NOT NULL DEFAULT '[]',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_tenant ON uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
