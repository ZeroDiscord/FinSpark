'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { sendRecommendationToAsana } = require('../services/recommendationService');
const {
  getRecommendationCards,
  dismissRecommendation,
} = require('../services/analytics/recommendationEngineService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const Tenant = require('../database/models/Tenant');
  const tenantParam = req.query.tenant_id || req.user.tenant_db_id;

  if (tenantParam) {
    const byKey = await Tenant.findOne({ tenant_key: String(tenantParam) }).lean();
    if (byKey) {
      return {
        id: byKey.tenant_key,
        tenant_hash: byKey.tenant_key,
        company_name: byKey.company_name,
      };
    }
    const tenant =
      (await findTenantByIdForOwner(tenantParam, req.user.sub)) ||
      (await findTenantByHashForOwner(tenantParam, req.user.sub));
    if (tenant) return tenant;
  }
  throw new NotFoundError('Tenant not found.');
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
