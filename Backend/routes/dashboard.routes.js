'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const mlClient = require('../services/mlClient');
const { cacheGet, cacheSet } = require('../services/cacheService');

async function resolveTenant(tenantParam, userId) {
  const res = await query(
    'SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2',
    [tenantParam, userId]
  );
  return res.rows[0] || null;
}

function makeProxiedRoute(cacheKey, mlPath, ttl = 300, buildParams = null) {
  return async (req, res, next) => {
    try {
      const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

      const ck = buildParams ? `${cacheKey}_${JSON.stringify(req.query)}` : cacheKey;
      const cached = await cacheGet(tenant.id, ck);
      if (cached) return res.json(cached);

      const params = buildParams ? buildParams(req, tenant) : { tenant_id: tenant.tenant_hash };
      const mlRes = await mlClient.get(mlPath, { params });

      await cacheSet(tenant.id, ck, mlRes.data, ttl);
      res.json(mlRes.data);
    } catch (err) {
      next(err);
    }
  };
}

// GET /api/dashboard/:tenantId/overview
router.get('/:tenantId/overview', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const cached = await cacheGet(tenant.id, 'overview');
    if (cached) return res.json(cached);

    const mlRes = await mlClient.get('/dashboard/tenants');
    const tenants = Array.isArray(mlRes.data) ? mlRes.data : [];
    const overview = tenants.find(t => t.tenant_id === tenant.tenant_hash) || {
      tenant_id: tenant.tenant_hash,
      n_sessions: 0,
      churn_rate: 0,
      markov_states: 0,
      ngram_vocab_size: 0,
      lstm_val_auc: 0,
      rag_documents: 0,
      trained_at: null,
    };

    await cacheSet(tenant.id, 'overview', overview, 300);
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/:tenantId/heatmap  (cache 10min)
router.get('/:tenantId/heatmap', requireAuth,
  makeProxiedRoute('heatmap', '/dashboard/heatmap', 600));

// GET /api/dashboard/:tenantId/funnel
router.get('/:tenantId/funnel', requireAuth,
  makeProxiedRoute('funnel', '/dashboard/funnel', 300));

// GET /api/dashboard/:tenantId/churn-distribution
router.get('/:tenantId/churn-distribution', requireAuth,
  makeProxiedRoute('churn_dist', '/dashboard/churn-distribution', 300));

// GET /api/dashboard/:tenantId/friction
router.get('/:tenantId/friction', requireAuth,
  makeProxiedRoute('friction_dash', '/dashboard/friction', 300));

// GET /api/dashboard/:tenantId/feature-usage
router.get('/:tenantId/feature-usage', requireAuth,
  makeProxiedRoute('feature_usage', '/dashboard/feature-usage', 300));

// GET /api/dashboard/:tenantId/segmentation
router.get('/:tenantId/segmentation', requireAuth,
  makeProxiedRoute('segmentation', '/dashboard/segmentation', 600));

// GET /api/dashboard/:tenantId/sessions?limit=8
router.get('/:tenantId/sessions', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const limit = Math.min(parseInt(req.query.limit || '8'), 50);
    const mlRes = await mlClient.get('/dashboard/sessions', {
      params: { tenant_id: tenant.tenant_hash, limit },
    });
    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/:tenantId/insight?question=...
router.get('/:tenantId/insight', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { question } = req.query;
    if (!question) return res.status(400).json({ error: 'question param required.' });

    const mlRes = await mlClient.get('/dashboard/insight', {
      params: { tenant_id: tenant.tenant_hash, question },
    });
    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/:tenantId/transition-matrix
router.get('/:tenantId/transition-matrix', requireAuth,
  makeProxiedRoute('transition_matrix', '/dashboard/transition-matrix', 600));

module.exports = router;
