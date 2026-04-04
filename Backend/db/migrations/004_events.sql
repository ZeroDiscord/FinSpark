-- Migration 004: events

CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id          VARCHAR(255) NOT NULL,
  user_id             VARCHAR(255),
  timestamp           TIMESTAMPTZ NOT NULL,
  deployment_type     VARCHAR(50),
  channel             VARCHAR(50),
  l1_domain           VARCHAR(255),
  l2_module           VARCHAR(255),
  l3_feature          VARCHAR(255) NOT NULL,
  l4_action           VARCHAR(255),
  l5_deployment_node  VARCHAR(255),
  duration_ms         INTEGER,
  success             BOOLEAN,
  metadata            JSONB NOT NULL DEFAULT '{}',
  feedback_text       TEXT,
  churn_label         SMALLINT,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_session ON events(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant_feature ON events(tenant_id, l3_feature);
CREATE INDEX IF NOT EXISTS idx_events_timestamp      ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_channel        ON events(tenant_id, channel);
