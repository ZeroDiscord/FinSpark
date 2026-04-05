'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const asana = require('../services/asanaIntegrationService');
const { AppError, NotFoundError, ValidationError } = require('../utils/errors');

async function resolveTenant(req) {
  const Tenant = require('../database/models/Tenant');
  const tenantParam = req.query.tenant_id || req.body?.tenant_id || req.user.tenant_db_id || req.user.tenant_id;

  if (tenantParam) {
    // Direct lookup by tenant_key — no ownership restriction needed for Asana ops
    const byKey = await Tenant.findOne({ tenant_key: String(tenantParam) }).lean();
    if (byKey) {
      return {
        id: byKey.tenant_key,
        tenant_hash: byKey.tenant_key,
        company_name: byKey.company_name,
        plan: byKey.plan,
        deployment_mode: byKey.deployment_mode,
        settings: byKey.settings || {},
      };
    }

    // Fallback: ownership-scoped lookup
    const tenant =
      (await findTenantByIdForOwner(tenantParam, req.user.sub)) ||
      (await findTenantByHashForOwner(tenantParam, req.user.sub));
    if (tenant) return tenant;
  }

  throw new NotFoundError('Tenant not found.');
}

async function connect(req, res) {
  const tenant = await resolveTenant(req);
  const state = jwt.sign({ sub: req.user.sub, tenant_id: tenant.id }, config.jwt.secret, { expiresIn: '10m' });
  return res.json({ auth_url: asana.buildAuthUrl(state) });
}

async function callback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) throw new ValidationError('code and state are required.');

  const payload = jwt.verify(state, config.jwt.secret);
  const tokenData = await asana.exchangeCode(code);
  const profile = await asana.fetchAsanaProfile(tokenData.access_token);
  await asana.saveConnection({
    tenantId: payload.tenant_id,
    connectedBy: payload.sub,
    tokenData,
    profile,
  });

  return res.redirect(`${config.frontendUrl}/app/asana?connected=true&tenant_id=${payload.tenant_id}`);
}

async function status(req, res) {
  const tenant = await resolveTenant(req);
  const connection = await asana.getConnection(tenant.id);
  return res.json({
    connected: Boolean(connection),
    workspace_id: connection?.workspace_gid || null,
    workspace_name: connection?.workspace_name || null,
    project_id: connection?.project_gid || null,
    project_name: connection?.project_name || null,
    section_id: connection?.default_column_gid || null,
    section_name: connection?.default_column_name || null,
    connected_at: connection?.connected_at || null,
    last_error: connection?.last_error || null,
  });
}

async function workspaces(req, res) {
  const tenant = await resolveTenant(req);
  const workspaces = await asana.getWorkspaces(tenant.id);
  return res.json(workspaces);
}

async function projects(req, res) {
  const tenant = await resolveTenant(req);
  const projects = await asana.getProjects(tenant.id, req.query.workspace_id);
  return res.json(projects);
}

async function sections(req, res) {
  const tenant = await resolveTenant(req);
  const sectionRows = await asana.getSections(tenant.id, req.query.project_id);
  return res.json(sectionRows);
}

async function saveMapping(req, res) {
  const tenant = await resolveTenant(req);
  const mapping = await asana.saveMapping(tenant.id, {
    workspaceId: req.body.workspace_id,
    projectId: req.body.project_id,
    sectionId: req.body.section_id,
  });
  return res.json(mapping);
}

async function createTask(req, res) {
  const tenant = await resolveTenant(req);
  const task = await asana.createTask(tenant.id, {
    recommendationId: req.body.recommendation_id,
    recommendation: req.body.recommendation,
    projectId: req.body.project_id,
    sectionId: req.body.section_id,
    dueDate: req.body.due_date,
  });
  return res.json(task);
}

async function sendBulk(req, res) {
  const tenant = await resolveTenant(req);
  const response = await asana.sendBulkRecommendations(tenant.id, {
    priority: req.body.priority || 'high',
    projectId: req.body.project_id,
    sectionId: req.body.section_id,
    dueDate: req.body.due_date,
  });
  return res.json(response);
}

function errorMapper(err, _req, _res, next) {
  if (err.code === 'ASANA_TOKEN_EXPIRED') {
    return next(new AppError('Asana token expired or access was revoked.', 401, 'ASANA_TOKEN_EXPIRED'));
  }
  return next(err);
}

module.exports = {
  connect,
  callback,
  status,
  workspaces,
  projects,
  sections,
  saveMapping,
  createTask,
  sendBulk,
  errorMapper,
};
