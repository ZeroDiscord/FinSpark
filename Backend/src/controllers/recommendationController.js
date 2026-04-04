'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { sendRecommendationToAsana } = require('../services/recommendationService');
const {
  getRecommendationCards,
  dismissRecommendation,
} = require('../services/analytics/recommendationEngineService');
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
  const recommendations = await getRecommendationCards(tenant.id, {
    start: req.query.start,
    end: req.query.end,
    priority: req.query.priority,
    category: req.query.category,
    status: req.query.status,
    refresh: req.query.refresh,
  });
  return res.json(recommendations);
}

async function dismiss(req, res) {
  const tenant = await resolveTenant(req);
  const success = await dismissRecommendation(tenant.id, req.params.id);
  return res.json({ success });
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

module.exports = { list, dismiss, sendToAsana };
