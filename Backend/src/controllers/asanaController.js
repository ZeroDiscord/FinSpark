'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const asana = require('../services/asanaIntegrationService');
const { query } = require('../../db/client');
const { NotFoundError, ValidationError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenant =
    (await findTenantByIdForOwner(req.user.tenant_db_id, req.user.sub)) ||
    (await findTenantByHashForOwner(req.user.tenant_id, req.user.sub));
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

async function connect(req, res) {
  const state = jwt.sign({ sub: req.user.sub }, config.jwt.secret, { expiresIn: '10m' });
  return res.json({ auth_url: await asana.getConnectUrl(state) });
}

async function callback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) throw new ValidationError('code and state are required.');

  const statePayload = jwt.verify(state, config.jwt.secret);
  const tenantRes = await query(
    `SELECT * FROM tenants WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [statePayload.sub]
  );
  const tenant = tenantRes.rows[0] || null;
  const tokenData = await asana.exchangeCode(code);
  const workspaceData = await asana.getWorkspace(tokenData.access_token);
  if (tenant) {
    await asana.saveConnection(tenant.id, tokenData, workspaceData);
  }

  return res.redirect(`${config.frontendUrl}/app/asana?connected=true`);
}

async function createTask(req, res) {
  const tenant = await resolveTenant(req);
  const { title, description, project_id } = req.body;
  const task = await asana.createTask(tenant.id, {
    title,
    description,
    priority: 'high',
    project_gid: project_id,
  });
  return res.json(task);
}

async function status(req, res) {
  const tenant = await resolveTenant(req);
  const connection = await asana.getConnection(tenant.id);
  return res.json({
    connected: Boolean(connection),
    workspace_name: connection?.workspace_name || null,
    workspace_id: connection?.workspace_gid || null,
  });
}

async function projects(req, res) {
  const tenant = await resolveTenant(req);
  const projects = await asana.getProjects(tenant.id);
  return res.json(projects);
}

module.exports = { connect, callback, createTask, status, projects };
