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

async function getFunnel(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.funnel);
}

async function getJourneys(req, res) {
  const analytics = await getDashboardAnalytics(buildFilters(req));
  return res.json(analytics.journeys);
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
  getFunnel,
  getJourneys,
  getTimeInsights,
  getTenantComparison,
};
