'use strict';

const router = require('express').Router();
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const config = require('../config');
const asana = require('../services/asanaService');

async function resolveTenantFromUser(userId) {
  const res = await query(
    'SELECT id, tenant_hash FROM tenants WHERE owner_id = $1 LIMIT 1',
    [userId]
  );
  return res.rows[0] || null;
}

// GET /api/asana/status
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenantFromUser(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const conn = await asana.getConnection(tenant.id);
    if (!conn) return res.json({ connected: false });

    res.json({
      connected: true,
      workspace_name: conn.workspace_name,
      workspace_gid: conn.workspace_gid,
      connected_at: conn.connected_at,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/asana/oauth/connect
router.get('/oauth/connect', requireAuth, async (req, res, next) => {
  try {
    // Encode user context in state JWT so we can retrieve it in callback
    const state = jwt.sign({ sub: req.user.sub }, config.jwt.secret, { expiresIn: '10m' });
    const authUrl = asana.getAuthUrl(state);
    res.json({ auth_url: authUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/asana/oauth/callback
router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${config.frontendUrl}/asana?error=missing_params`);
    }

    let statePayload;
    try {
      statePayload = jwt.verify(state, config.jwt.secret);
    } catch {
      return res.redirect(`${config.frontendUrl}/asana?error=invalid_state`);
    }

    const tenant = await resolveTenantFromUser(statePayload.sub);
    if (!tenant) return res.redirect(`${config.frontendUrl}/asana?error=tenant_not_found`);

    const tokenData = await asana.exchangeCode(code);
    const workspaceData = await asana.getWorkspace(tokenData.access_token);
    await asana.saveConnection(tenant.id, tokenData, workspaceData);

    res.redirect(`${config.frontendUrl}/asana?connected=true`);
  } catch (err) {
    res.redirect(`${config.frontendUrl}/asana?error=oauth_failed`);
  }
});

// GET /api/asana/projects
router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenantFromUser(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const projects = await asana.getProjects(tenant.id);
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// POST /api/asana/tasks  — push a recommendation to Asana
router.post('/tasks', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenantFromUser(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { recommendation_id, project_id } = req.body;
    if (!recommendation_id) return res.status(400).json({ error: 'recommendation_id required.' });

    const recRes = await query(
      'SELECT * FROM recommendations WHERE id = $1 AND tenant_id = $2',
      [recommendation_id, tenant.id]
    );
    if (!recRes.rows.length) return res.status(404).json({ error: 'Recommendation not found.' });

    const rec = recRes.rows[0];
    if (rec.asana_task_id) {
      return res.json({ task_id: rec.asana_task_id, task_url: rec.asana_task_url, already_created: true });
    }

    const { task_gid, permalink_url } = await asana.createTask(tenant.id, { ...rec, project_gid: project_id });

    await query(
      'UPDATE recommendations SET asana_task_id = $1, asana_task_url = $2 WHERE id = $3',
      [task_gid, permalink_url, recommendation_id]
    );

    res.json({ task_id: task_gid, task_url: permalink_url });
  } catch (err) {
    next(err);
  }
});

// GET /api/asana/tasks — list pushed tasks
router.get('/tasks', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenantFromUser(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const result = await query(
      `SELECT id AS recommendation_id, asana_task_id AS task_id, asana_task_url AS task_url,
              title AS task_name, priority, created_at
       FROM recommendations
       WHERE tenant_id = $1 AND asana_task_id IS NOT NULL
       ORDER BY created_at DESC`,
      [tenant.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
