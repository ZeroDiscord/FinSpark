'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { getDashboardData, predictLatestSessionChurn } = require('../services/dashboardService');
const {
  getDashboardAnalytics,
  computeTenantComparison,
} = require('../services/analytics/dashboardAnalyticsService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenantFromQueryOrAuth(req) {
  const Tenant = require('../database/models/Tenant');

  function normalizeTenantDoc(doc) {
    if (!doc) return null;
    return {
      id: doc.tenant_key,
      tenant_hash: doc.tenant_key,
      company_name: doc.company_name,
      plan: doc.plan,
      ml_trained: Boolean(doc.ml_trained),
      trained_at: doc.trained_at || null,
      created_at: doc.createdAt || doc.created_at || null,
      deployment_mode: doc.deployment_mode,
      status: doc.status,
      settings: doc.settings || {},
    };
  }

  const tenantParam = req.query.tenant_id || req.user.tenant_db_id;
  if (tenantParam) {
    // Try by tenant_key first (most common), then try ownership-scoped lookups as fallback
    const byKey = await Tenant.findOne({ tenant_key: String(tenantParam) }).lean();
    if (byKey) return normalizeTenantDoc(byKey);

    const tenant =
      (await findTenantByHashForOwner(tenantParam, req.user.sub)) ||
      (await findTenantByIdForOwner(tenantParam, req.user.sub));
    if (tenant) return tenant;
  }

  throw new NotFoundError('Tenant not found.');
}

async function getDashboard(req, res) {
  const tenant = await resolveTenantFromQueryOrAuth(req);
  const dashboard = await getDashboardData({
    tenantId: tenant.id,
    start: req.query.start,
    end: req.query.end,
  });
  const mlPrediction = await predictLatestSessionChurn(tenant.id).catch(() => null);

  return res.json({
    ...dashboard,
    latest_prediction: mlPrediction,
  });
}

function buildFilters(req) {
  return {
    tenantId: req.tenant.id,
    start: req.query.start,
    end: req.query.end,
    channel: req.query.channel,
    deploymentType: req.query.deployment_type,
    feature: req.query.feature,
    groupBy: req.query.group_by,
    steps: req.query.steps,
    limit: req.query.limit,
  };
}

async function attachTenant(req, _res, next) {
  req.tenant = await resolveTenantFromQueryOrAuth(req);
  next();
}

async function getKpis(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.kpis);
}

async function getFeatureUsage(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json({ rows: analytics.feature_usage, group_by: req.query.group_by || 'feature' });
}

async function getChurn(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.churn);
}

async function getFriction(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  const churnByFeature = analytics.churn?.churn_by_feature || [];
  const dropOffs = analytics.churn?.top_drop_off_features || [];
  const totalSessions = analytics.kpis?.total_sessions || 1;

  // Build a drop-off map for merging
  const dropMap = new Map(dropOffs.map((d) => [d.feature, d]));

  // Derive friction from churn_by_feature, enriched with drop-off data
  const EXCLUDE = new Set(['drop_off', 'session_end', 'exit', 'error']);
  const friction = churnByFeature
    .filter((f) => f.feature && !EXCLUDE.has(f.feature))
    .map((f) => {
      const drop = dropMap.get(f.feature);
      // drop_off_prob: weighted blend of churn rate and drop-off proportion
      const dropOffRatio = drop ? drop.drop_off_count / totalSessions : 0;
      const dropOffProb = drop
        ? 0.6 * f.avg_churn_probability + 0.4 * dropOffRatio
        : f.avg_churn_probability;

      let severity = 'low';
      if (dropOffProb >= 0.5 || f.churn_rate >= 0.6) severity = 'critical';
      else if (dropOffProb >= 0.3 || f.churn_rate >= 0.4) severity = 'high';
      else if (dropOffProb >= 0.15 || f.churn_rate >= 0.25) severity = 'moderate';

      return {
        feature: f.feature,
        drop_off_prob: Number(dropOffProb.toFixed(4)),
        churn_rate: f.churn_rate,
        session_count: f.session_count,
        severity,
      };
    })
    .sort((a, b) => b.drop_off_prob - a.drop_off_prob);

  return res.json(friction);
}

async function getChurnDistribution(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.churn_distribution);
}

async function getFunnel(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.funnel);
}

async function getJourneys(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.journeys);
}

async function getSessions(req, res) {
  const requestedLimit =
    req.query.limit === undefined || req.query.limit === null || req.query.limit === ''
      ? null
      : Number(req.query.limit);
  const analytics = await getDashboardAnalytics({
    ...buildFilters(req),
    limit: requestedLimit || undefined,
  });

  let rows = (analytics.scoped_sessions || [])
    .map((session) => ({
      session_id: session.session_id,
      user_id: session.user_id,
      events: session.feature_sequence || [],
      duration_sec: Number(session.session_length_ms || 0) / 1000,
      is_churn: Number(session.churn_label || 0) === 1,
      drop_off_feature: session.drop_off_feature || null,
      session_start: session.session_start,
    }))
    .sort((a, b) => new Date(b.session_start || 0) - new Date(a.session_start || 0));

  if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
    rows = rows.slice(0, requestedLimit);
  }

  return res.json(rows);
}

async function getJourneyGraph(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.journey_graph);
}

async function getTimeInsights(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.time_insights);
}

async function getTenantComparison(req, res) {
  const comparison = await computeTenantComparison({
    ownerId: req.user.sub,
    feature: req.query.feature || 'Upload Documents',
    start: req.query.start,
    end: req.query.end,
    channel: req.query.channel,
    deploymentType: req.query.deployment_type,
  });
  return res.json(comparison);
}

module.exports = {
  attachTenant,
  getDashboard,
  getKpis,
  getFeatureUsage,
  getChurn,
  getFriction,
  getChurnDistribution,
  getFunnel,
  getJourneys,
  getSessions,
  getJourneyGraph,
  getTimeInsights,
  getTenantComparison,
};
