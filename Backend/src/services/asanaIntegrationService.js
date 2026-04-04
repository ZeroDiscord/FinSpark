'use strict';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config');
const { AsanaConnection, Recommendation } = require('../database/models');
const {
  AppError,
  AsanaConnectionMissingError,
  ValidationError,
} = require('../utils/errors');

const ASANA_API = 'https://app.asana.com/api/1.0';
const ASANA_AUTH = 'https://app.asana.com/-/oauth_authorize';
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token';

function getEncryptionKey() {
  const key = String(config.asana.tokenEncryptionKey || '');
  if (key.length < 64) {
    throw new AppError('ASANA_TOKEN_ENCRYPTION_KEY must be a 64-character hex string.', 500, 'ASANA_ENCRYPTION_KEY_INVALID');
  }
  return Buffer.from(key.slice(0, 64), 'hex');
}

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}

function buildAuthUrl(state) {
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
  const response = await axios.post(
    ASANA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.asana.clientId,
      client_secret: config.asana.clientSecret,
      redirect_uri: config.asana.redirectUri,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data;
}

async function refreshAccessToken(connection) {
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  if (!refreshToken) throw new AppError('Asana refresh token missing.', 401, 'ASANA_REFRESH_TOKEN_MISSING');

  const response = await axios.post(
    ASANA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.asana.clientId,
      client_secret: config.asana.clientSecret,
      refresh_token: refreshToken,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  connection.access_token_encrypted = encryptToken(response.data.access_token);
  if (response.data.refresh_token) {
    connection.refresh_token_encrypted = encryptToken(response.data.refresh_token);
  }
  connection.token_expires_at = new Date(Date.now() + Number(response.data.expires_in || 3600) * 1000);
  connection.last_error = null;
  await connection.save();
  return response.data.access_token;
}

async function ensureAccessToken(connection) {
  if (!connection) throw new AsanaConnectionMissingError();
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now() + 60_000) {
    return refreshAccessToken(connection);
  }
  return decryptToken(connection.access_token_encrypted);
}

async function asanaRequest(connection, method, path, { params, data } = {}) {
  const accessToken = await ensureAccessToken(connection);
  try {
    const response = await axios({
      method,
      url: `${ASANA_API}${path}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      params,
      data,
    });
    connection.last_error = null;
    connection.last_sync_at = new Date();
    await connection.save();
    return response.data.data;
  } catch (error) {
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    connection.last_error = errorMessage;
    await connection.save();

    if (status === 401) {
      throw new AppError('Asana token expired or access was revoked.', 401, 'ASANA_TOKEN_EXPIRED');
    }
    if (status === 429) {
      throw new AppError('Asana rate limit reached. Retry later.', 429, 'ASANA_RATE_LIMIT');
    }
    throw new AppError(errorMessage || 'Asana API request failed.', status, 'ASANA_API_ERROR');
  }
}

async function fetchAsanaProfile(accessToken) {
  const response = await axios.get(`${ASANA_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = response.data.data;
  return {
    user_gid: user.gid,
    workspaces: (user.workspaces || []).map((workspace) => ({
      id: workspace.gid,
      name: workspace.name,
    })),
  };
}

async function saveConnection({
  tenantId,
  connectedBy,
  tokenData,
  profile,
}) {
  const primaryWorkspace = profile.workspaces[0] || null;
  const doc = await AsanaConnection.findOneAndUpdate(
    { tenant_id: tenantId },
    {
      $set: {
        tenant_id: tenantId,
        connected_by: connectedBy,
        asana_user_gid: profile.user_gid,
        workspace_gid: primaryWorkspace?.id || null,
        workspace_name: primaryWorkspace?.name || null,
        access_token_encrypted: encryptToken(tokenData.access_token),
        refresh_token_encrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        token_expires_at: new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000),
        connected_at: new Date(),
        last_error: null,
      },
    },
    { upsert: true, new: true }
  );
  return doc;
}

async function getConnection(tenantId) {
  return AsanaConnection.findOne({ tenant_id: tenantId });
}

async function getWorkspaces(tenantId) {
  const connection = await getConnection(tenantId);
  const workspaces = await asanaRequest(connection, 'get', '/workspaces', { params: { limit: 100 } });
  return workspaces.map((workspace) => ({ id: workspace.gid, name: workspace.name }));
}

async function getProjects(tenantId, workspaceId) {
  const connection = await getConnection(tenantId);
  const workspace = workspaceId || connection?.workspace_gid;
  if (!workspace) throw new ValidationError('workspace_id is required.');
  const projects = await asanaRequest(connection, 'get', '/projects', {
    params: { workspace, limit: 100, archived: false },
  });
  return projects.map((project) => ({ id: project.gid, name: project.name }));
}

async function getSections(tenantId, projectId) {
  const connection = await getConnection(tenantId);
  const project = projectId || connection?.project_gid;
  if (!project) throw new ValidationError('project_id is required.');
  const sections = await asanaRequest(connection, 'get', `/projects/${project}/sections`, { params: { limit: 100 } });
  return sections.map((section) => ({ id: section.gid, name: section.name }));
}

async function saveMapping(tenantId, { workspaceId, projectId, sectionId }) {
  if (!workspaceId) throw new ValidationError('workspace_id is required.');
  if (!projectId) throw new ValidationError('project_id is required.');
  if (!sectionId) throw new ValidationError('section_id is required.');

  const connection = await getConnection(tenantId);
  if (!connection) throw new AsanaConnectionMissingError();

  const [workspaces, projects, sections] = await Promise.all([
    getWorkspaces(tenantId),
    getProjects(tenantId, workspaceId),
    getSections(tenantId, projectId),
  ]);

  const workspace = workspaces.find((item) => item.id === workspaceId);
  const project = projects.find((item) => item.id === projectId);
  const section = sections.find((item) => item.id === sectionId);

  connection.workspace_gid = workspaceId;
  connection.workspace_name = workspace?.name || connection.workspace_name;
  connection.project_gid = projectId;
  connection.project_name = project?.name || connection.project_name;
  connection.default_column_gid = sectionId;
  connection.default_column_name = section?.name || connection.default_column_name;
  await connection.save();

  return {
    workspace_id: connection.workspace_gid,
    workspace_name: connection.workspace_name,
    project_id: connection.project_gid,
    project_name: connection.project_name,
    section_id: connection.default_column_gid,
    section_name: connection.default_column_name,
  };
}

function buildTaskPayload({ recommendation, projectId, sectionId, dueDate, workspaceId }) {
  const priorityLabel = String(recommendation.priority || 'medium').toUpperCase();
  const lines = [
    recommendation.problem,
    '',
    `Suggested action: ${recommendation.suggestion}`,
    `Priority: ${priorityLabel}`,
    recommendation.metrics?.churn_rate !== undefined ? `Churn Rate: ${Math.round(Number(recommendation.metrics.churn_rate) * 100)}%` : null,
    recommendation.metrics?.failure_rate !== undefined ? `Failure Rate: ${Math.round(Number(recommendation.metrics.failure_rate) * 100)}%` : null,
    '',
    'Generated by FinSpark Enterprise Feature Intelligence Platform',
  ].filter(Boolean);

  return {
    data: {
      name: `Improve ${recommendation.feature}`,
      notes: lines.join('\n'),
      workspace: workspaceId,
      projects: [projectId],
      memberships: [{ project: projectId, section: sectionId }],
      due_on: dueDate || null,
    },
  };
}

async function createTask(tenantId, {
  recommendationId,
  recommendation,
  projectId,
  sectionId,
  dueDate,
}) {
  const connection = await getConnection(tenantId);
  if (!connection) throw new AsanaConnectionMissingError();
  const resolvedProjectId = projectId || connection.project_gid;
  const resolvedSectionId = sectionId || connection.default_column_gid;
  const resolvedWorkspaceId = connection.workspace_gid;

  if (!resolvedWorkspaceId) throw new ValidationError('No workspace selected.');
  if (!resolvedProjectId) throw new ValidationError('No project selected.');
  if (!resolvedSectionId) throw new ValidationError('No section selected.');

  let sourceRecommendation = recommendation;
  if (!sourceRecommendation && recommendationId) {
    const record = await Recommendation.findOne({ _id: recommendationId, tenant_id: tenantId }).lean();
    if (!record) throw new ValidationError('Recommendation not found.');
    sourceRecommendation = {
      feature: record.source_data?.feature || record.feature || record.title,
      problem: record.problem,
      suggestion: record.suggestion,
      priority: record.priority,
      metrics: record.metrics || {},
    };
  }
  if (!sourceRecommendation) throw new ValidationError('recommendation or recommendation_id is required.');

  const payload = buildTaskPayload({
    recommendation: sourceRecommendation,
    projectId: resolvedProjectId,
    sectionId: resolvedSectionId,
    dueDate,
    workspaceId: resolvedWorkspaceId,
  });

  const connectionDoc = await getConnection(tenantId);
  const task = await asanaRequest(connectionDoc, 'post', '/tasks', {
    params: { opt_fields: 'gid,permalink_url' },
    data: payload,
  });
  return {
    task_gid: task.gid,
    permalink_url: task.permalink_url,
    project_id: resolvedProjectId,
    section_id: resolvedSectionId,
  };
}

async function sendBulkRecommendations(tenantId, { priority = 'high', projectId, sectionId, dueDate }) {
  const priorities = priority === 'critical_or_high' ? ['critical', 'high'] : [priority];
  const recommendations = await Recommendation.find({
    tenant_id: tenantId,
    status: 'open',
    priority: { $in: priorities },
  })
    .sort({ impact_score: -1, created_at: -1 })
    .lean();

  const results = [];
  for (const item of recommendations) {
    try {
      const task = await createTask(tenantId, {
        recommendation: {
          feature: item.source_data?.feature || item.feature || item.title,
          problem: item.problem,
          suggestion: item.suggestion,
          priority: item.priority,
          metrics: item.metrics || {},
        },
        projectId,
        sectionId,
        dueDate,
      });
      await Recommendation.updateOne({ _id: item._id }, { $set: { status: 'sent', asana_task_gid: task.task_gid, asana_task_url: task.permalink_url } });
      results.push({ recommendation_id: String(item._id), success: true, task_gid: task.task_gid, permalink_url: task.permalink_url });
    } catch (error) {
      results.push({ recommendation_id: String(item._id), success: false, error: error.message });
    }
  }
  return {
    total: recommendations.length,
    success_count: results.filter((item) => item.success).length,
    failure_count: results.filter((item) => !item.success).length,
    results,
  };
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  fetchAsanaProfile,
  saveConnection,
  getConnection,
  getWorkspaces,
  getProjects,
  getSections,
  saveMapping,
  createTask,
  sendBulkRecommendations,
};
