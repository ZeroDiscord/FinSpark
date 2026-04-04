'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/dashboardController');
const mlClient = require('../../services/mlClient');
const { cacheGet, cacheSet } = require('../../services/cacheService');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');

async function resolveTenantByParam(tenantParam, userId) {
  return (
    (await findTenantByIdForOwner(tenantParam, userId)) ||
    (await findTenantByHashForOwner(tenantParam, userId))
  );
}

function makeProxiedRoute(cacheKey, mlPath, ttl = 300, buildParams = null) {
  return asyncHandler(async (req, res) => {
    const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const ck = buildParams ? `${cacheKey}_${JSON.stringify(req.query)}` : cacheKey;
    const cached = await cacheGet(tenant.id, ck);
    if (cached) return res.json(cached);

    const params = buildParams ? buildParams(req, tenant) : { tenant_id: tenant.tenant_hash };
    const mlRes = await mlClient.get(mlPath, { params });
    await cacheSet(tenant.id, ck, mlRes.data, ttl);
    return res.json(mlRes.data);
  });
}

router.get('/', requireAuth, asyncHandler(controller.getDashboard));
router.get('/kpis', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getKpis));
router.get('/feature-usage', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getFeatureUsage));
router.get('/churn', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getChurn));
router.get('/funnel', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getFunnel));
router.get('/journeys', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getJourneys));
router.get('/time-insights', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getTimeInsights));
router.get('/tenant-comparison', requireAuth, asyncHandler(controller.getTenantComparison));

// Legacy per-tenant dashboard routes (/:tenantId/...)
router.get('/:tenantId/overview', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const cached = await cacheGet(tenant.id, 'overview');
  if (cached) return res.json(cached);

  const mlRes = await mlClient.get('/dashboard/tenants');
  const tenants = Array.isArray(mlRes.data) ? mlRes.data : [];
  const overview = tenants.find((t) => t.tenant_id === tenant.tenant_hash) || {
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
  return res.json(overview);
}));

router.get('/:tenantId/heatmap', requireAuth, makeProxiedRoute('heatmap', '/dashboard/heatmap', 600));
router.get('/:tenantId/funnel', requireAuth, makeProxiedRoute('funnel', '/dashboard/funnel', 300));
router.get('/:tenantId/churn-distribution', requireAuth, makeProxiedRoute('churn_dist', '/dashboard/churn-distribution', 300));
router.get('/:tenantId/friction', requireAuth, makeProxiedRoute('friction_dash', '/dashboard/friction', 300));
router.get('/:tenantId/feature-usage', requireAuth, makeProxiedRoute('feature_usage', '/dashboard/feature-usage', 300));
router.get('/:tenantId/segmentation', requireAuth, makeProxiedRoute('segmentation', '/dashboard/segmentation', 600));
router.get('/:tenantId/transition-matrix', requireAuth, makeProxiedRoute('transition_matrix', '/dashboard/transition-matrix', 600));

router.get('/:tenantId/sessions', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const limit = Math.min(parseInt(req.query.limit || '8', 10), 50);
  const mlRes = await mlClient.get('/dashboard/sessions', {
    params: { tenant_id: tenant.tenant_hash, limit },
  });
  return res.json(mlRes.data);
}));

router.get('/:tenantId/insight', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const { question } = req.query;
  if (!question) return res.status(400).json({ error: 'question param required.' });

  const mlRes = await mlClient.get('/dashboard/insight', {
    params: { tenant_id: tenant.tenant_hash, question },
  });
  return res.json(mlRes.data);
}));

module.exports = router;
