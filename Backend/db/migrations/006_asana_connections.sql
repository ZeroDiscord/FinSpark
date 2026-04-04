-- Migration 006: asana_connections

CREATE TABLE IF NOT EXISTS asana_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  asana_user_gid   VARCHAR(255),
  workspace_gid    VARCHAR(255),
  workspace_name   VARCHAR(255),
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
