-- Migration 005: recommendations

CREATE TABLE IF NOT EXISTS recommendations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title            VARCHAR(512) NOT NULL,
  description      TEXT NOT NULL,
  priority         VARCHAR(20) NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  category         VARCHAR(50) NOT NULL,
  affected_feature VARCHAR(255),
  metric_impact    VARCHAR(255),
  action_type      VARCHAR(50),
  rule_id          VARCHAR(10),
  source_data      JSONB NOT NULL DEFAULT '{}',
  asana_task_id    VARCHAR(255),
  asana_task_url   TEXT,
  dismissed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recs_tenant_priority ON recommendations(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_recs_tenant_category ON recommendations(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_recs_asana           ON recommendations(asana_task_id) WHERE asana_task_id IS NOT NULL;
