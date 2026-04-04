'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { query } = require('../db/client');
const config = require('../config');
const logger = require('../utils/logger');

const ASANA_API = 'https://app.asana.com/api/1.0';
const ASANA_AUTH = 'https://app.asana.com/-/oauth_authorize';
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token';

// AES-256-GCM encryption for stored tokens
function encryptToken(plaintext) {
  const key = Buffer.from(config.asana.tokenEncryptionKey.slice(0, 64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(stored) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const key = Buffer.from(config.asana.tokenEncryptionKey.slice(0, 64), 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.asana.clientId,
    redirect_uri: config.asana.redirectUri,
    response_type: 'code',
    scope: 'default',
    state,
  });
  return `${ASANA_AUTH}?${params.toString()}`;
}

async function exchangeCode(code) {
  const res = await axios.post(ASANA_TOKEN_URL, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.asana.clientId,
    client_secret: config.asana.clientSecret,
    redirect_uri: config.asana.redirectUri,
    code,
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data; // { access_token, refresh_token, expires_in, token_type }
}

async function getWorkspace(accessToken) {
  const res = await axios.get(`${ASANA_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = res.data.data;
  const workspace = user.workspaces?.[0];
  return {
    user_gid: user.gid,
    workspace_gid: workspace?.gid,
    workspace_name: workspace?.name,
  };
}

async function getConnection(tenantDbId) {
  const res = await query(
    'SELECT * FROM asana_connections WHERE tenant_id = $1',
    [tenantDbId]
  );
  return res.rows[0] || null;
}

async function ensureFreshToken(conn) {
  if (conn.token_expires_at && new Date(conn.token_expires_at) > new Date()) {
    return decryptToken(conn.access_token);
  }
  if (!conn.refresh_token) return decryptToken(conn.access_token);

  try {
    const res = await axios.post(ASANA_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.asana.clientId,
      client_secret: config.asana.clientSecret,
      refresh_token: decryptToken(conn.refresh_token),
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, expires_in } = res.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);
    await query(
      `UPDATE asana_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE tenant_id = $3`,
      [encryptToken(access_token), expiresAt, conn.tenant_id]
    );
    return access_token;
  } catch (err) {
    logger.error({ event: 'asana_token_refresh_failed', error: err.message });
    return decryptToken(conn.access_token); // fall back to existing
  }
}

async function saveConnection(tenantDbId, tokenData, workspaceData) {
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
  await query(
    `INSERT INTO asana_connections
       (tenant_id, asana_user_gid, workspace_gid, workspace_name, access_token, refresh_token, token_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       asana_user_gid = EXCLUDED.asana_user_gid,
       workspace_gid = EXCLUDED.workspace_gid,
       workspace_name = EXCLUDED.workspace_name,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at = NOW()`,
    [
      tenantDbId,
      workspaceData.user_gid,
      workspaceData.workspace_gid,
      workspaceData.workspace_name,
      encryptToken(tokenData.access_token),
      tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      expiresAt,
    ]
  );
}

async function getProjects(tenantDbId) {
  const conn = await getConnection(tenantDbId);
  if (!conn) throw Object.assign(new Error('Asana not connected.'), { status: 400 });

  const token = await ensureFreshToken(conn);
  const res = await axios.get(`${ASANA_API}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { workspace: conn.workspace_gid, limit: 50 },
  });
  return res.data.data.map(p => ({ id: p.gid, name: p.name }));
}

async function createTask(tenantDbId, recommendation) {
  const conn = await getConnection(tenantDbId);
  if (!conn) throw Object.assign(new Error('Asana not connected.'), { status: 400 });

  const token = await ensureFreshToken(conn);
  const notes = [
    recommendation.description,
    '',
    `Priority: ${recommendation.priority}`,
    recommendation.affected_feature ? `Affected Feature: ${recommendation.affected_feature}` : '',
    recommendation.metric_impact ? `Metric Impact: ${recommendation.metric_impact}` : '',
    '',
    'Generated by FinSpark Intelligence Platform',
  ].filter(Boolean).join('\n');

  const body = {
    data: {
      name: recommendation.title,
      notes,
      workspace: conn.workspace_gid,
    },
  };

  if (recommendation.project_gid) body.data.projects = [recommendation.project_gid];

  const res = await axios.post(`${ASANA_API}/tasks`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    task_gid: res.data.data.gid,
    permalink_url: res.data.data.permalink_url,
  };
}

module.exports = { getAuthUrl, exchangeCode, getWorkspace, saveConnection, getConnection, getProjects, createTask };
