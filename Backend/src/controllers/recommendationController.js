'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { getOrCreateRecommendations, sendRecommendationToAsana } = require('../services/recommendationService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenantId = req.query.tenant_id || req.user.tenant_db_id;
  const tenant =
    (await findTenantByIdForOwner(tenantId, req.user.sub)) ||
    (await findTenantByHashForOwner(tenantId, req.user.sub));
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

async function list(req, res) {
  const tenant = await resolveTenant(req);
  const recommendations = await getOrCreateRecommendations(tenant);
  return res.json(recommendations.map((item) => ({
    id: item.id,
    feature: item.feature || item.affected_feature,
    feature_name: item.feature || item.affected_feature,
    problem: item.problem || item.description,
    suggestion: item.suggestion || item.description,
    priority: item.priority,
    churn_score: item.source_data?.drop_off_rate || 0.72,
  })));
}

async function sendToAsana(req, res) {
  const tenant = await resolveTenant(req);
  const task = await sendRecommendationToAsana(
    tenant.id,
    req.params.id,
    req.body.project_id
  );
  return res.json(task);
}

module.exports = { list, sendToAsana };
