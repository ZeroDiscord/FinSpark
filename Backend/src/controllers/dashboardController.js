'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { getDashboardData, predictLatestSessionChurn } = require('../services/dashboardService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenantFromQueryOrAuth(req) {
  if (req.query.tenant_id) {
    const tenant =
      (await findTenantByHashForOwner(req.query.tenant_id, req.user.sub)) ||
      (await findTenantByIdForOwner(req.query.tenant_id, req.user.sub));
    if (!tenant) throw new NotFoundError('Tenant not found.');
    return tenant;
  }

  const tenant = await findTenantByIdForOwner(req.user.tenant_db_id, req.user.sub);
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
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

module.exports = { getDashboard };
