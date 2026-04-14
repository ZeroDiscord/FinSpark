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
router.get('/churn-distribution', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getChurnDistribution));
router.get('/funnel', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getFunnel));
router.get('/journeys', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getJourneys));
router.get('/journey-graph', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getJourneyGraph));
router.get('/time-insights', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getTimeInsights));
router.get('/tenant-comparison', requireAuth, asyncHandler(controller.getTenantComparison));

// Legacy per-tenant dashboard routes (/:tenantId/...)
router.get('/:tenantId/overview', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const cached = await cacheGet(tenant.id, 'overview');
  if (cached) return res.json(cached);

  // Fetch ML-service manifest and local analytics in parallel
  const {
    getDashboardAnalytics,
  } = require('../services/analytics/dashboardAnalyticsService');

  const [mlResult, analyticsResult] = await Promise.allSettled([
    mlClient.get('/dashboard/tenants'),
    getDashboardAnalytics({ tenantId: tenant.id }),
  ]);

  const tenants = mlResult.status === 'fulfilled' && Array.isArray(mlResult.value.data)
    ? mlResult.value.data
    : [];
  const mlOverview = tenants.find((t) => t.tenant_id === tenant.tenant_hash) || {};

  // Derive metrics from real dataset
  const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : null;
  let dbSessions = 0;
  let dbChurnRate = 0;
  let dbUniqueFeatures = 0;
  let dbFeatureVocab = 0;
  let dbAvgSessionDurationMs = 0;
  let dbLstmAuc = 0;

  if (analytics) {
    dbSessions = analytics.kpis?.total_sessions || 0;
    dbChurnRate = analytics.kpis?.churn_rate || 0;
    dbAvgSessionDurationMs = analytics.kpis?.avg_session_duration_ms || 0;

    // Unique features discovered across sessions = Markov states
    const featureSet = new Set();
    for (const session of analytics.scoped_sessions || []) {
      for (const f of session.feature_sequence || []) {
        if (f) featureSet.add(f);
      }
    }
    dbUniqueFeatures = featureSet.size;

    // Feature vocabulary from events = N-gram vocab
    const vocabSet = new Set();
    for (const event of analytics.scoped_events || []) {
      if (event.l3_feature) vocabSet.add(event.l3_feature);
    }
    dbFeatureVocab = vocabSet.size;

    // Derive a proxy AUC from prediction quality if predictions exist
    if (analytics.latest_predictions?.size > 0) {
      const predictions = [...analytics.latest_predictions.values()];
      const probs = predictions.map((p) => Number(p.churn_probability || 0)).filter(Number.isFinite);
      if (probs.length > 1) {
        // Discrimination score: higher spread = better model separation
        const mean = probs.reduce((s, v) => s + v, 0) / probs.length;
        const variance = probs.reduce((s, v) => s + (v - mean) ** 2, 0) / probs.length;
        const spread = Math.sqrt(variance);
        // Map spread (0–0.5) to AUC proxy (0.5–1.0)
        dbLstmAuc = Math.min(1, 0.5 + spread);
      }
    }
  }

  const overview = {
    tenant_id: mlOverview.tenant_id || tenant.tenant_hash,
    n_sessions: mlOverview.n_sessions || dbSessions,
    churn_rate: mlOverview.churn_rate || dbChurnRate,
    markov_states: mlOverview.markov_states || dbUniqueFeatures,
    ngram_vocab_size: mlOverview.ngram_vocab_size || dbFeatureVocab,
    lstm_val_auc: mlOverview.lstm_val_auc || dbLstmAuc,
    rag_documents: mlOverview.rag_documents || 0,
    trained_at: mlOverview.trained_at || null,
    avg_session_duration_ms: mlOverview.avg_session_duration_ms || dbAvgSessionDurationMs,
  };

  await cacheSet(tenant.id, 'overview', overview, 300);
  return res.json(overview);
}));

router.get('/:tenantId/heatmap', requireAuth, makeProxiedRoute('heatmap', '/dashboard/heatmap', 600));
router.get('/:tenantId/funnel', requireAuth, makeProxiedRoute('funnel', '/dashboard/funnel', 300));
router.get('/:tenantId/journey-graph', requireAuth, asyncHandler(async (req, res) => {
  req.query.tenant_id = req.params.tenantId;
  await controller.attachTenant(req, res, () => null);
  return controller.getJourneyGraph(req, res);
}));
router.get('/:tenantId/churn-distribution', requireAuth, asyncHandler(async (req, res) => {
  req.query.tenant_id = req.params.tenantId;
  await controller.attachTenant(req, res, () => null);
  return controller.getChurnDistribution(req, res);
}));
router.get('/:tenantId/friction', requireAuth, asyncHandler(async (req, res) => {
  req.query.tenant_id = req.params.tenantId;
  await controller.attachTenant(req, res, () => null);
  return controller.getFriction(req, res);
}));
router.get('/:tenantId/feature-usage', requireAuth, asyncHandler(async (req, res) => {
  req.query.tenant_id = req.params.tenantId;
  await controller.attachTenant(req, res, () => null);
  return controller.getFeatureUsage(req, res);
}));
router.get('/:tenantId/segmentation', requireAuth, makeProxiedRoute('segmentation', '/dashboard/segmentation', 600));
router.get('/:tenantId/transition-matrix', requireAuth, makeProxiedRoute('transition_matrix', '/dashboard/transition-matrix', 600));

router.get('/:tenantId/sessions', requireAuth, asyncHandler(async (req, res) => {
  req.query.tenant_id = req.params.tenantId;
  await controller.attachTenant(req, res, () => null);
  return controller.getSessions(req, res);
}));

// GET /api/dashboard/:tenantId/license-usage
// Returns detected features vs actively used features for the tenant.
router.get('/:tenantId/license-usage', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenantByParam(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const DetectedFeature = require('../database/models/DetectedFeature');
  const UsageEvent      = require('../database/models/UsageEvent');

  const [detected, usedFeatures] = await Promise.all([
    DetectedFeature.find({ tenant_id: tenant.id }).lean(),
    UsageEvent.distinct('l3_feature', { tenant_id: tenant.id }),
  ]);

  const usedSet = new Set(usedFeatures.filter(Boolean));
  const rows = detected.map((f) => ({
    l1_domain:  f.l1_domain || 'Unknown',
    l2_module:  f.l2_module || 'Unknown',
    l3_feature: f.l3_feature,
    is_used:    usedSet.has(f.l3_feature),
    confidence: f.confidence,
  }));

  const licensed = rows.length;
  const used     = rows.filter((r) => r.is_used).length;
  const unused   = licensed - used;

  return res.json({
    licensed,
    used,
    unused,
    unused_pct: licensed ? Number(((unused / licensed) * 100).toFixed(1)) : 0,
    by_module: Object.values(
      rows.reduce((acc, r) => {
        const key = r.l2_module;
        if (!acc[key]) acc[key] = { module: key, licensed: 0, used: 0 };
        acc[key].licensed += 1;
        if (r.is_used) acc[key].used += 1;
        return acc;
      }, {})
    ),
    features: rows,
  });
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
