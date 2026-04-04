'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const {
  buildPowerBiCsv,
  buildPowerBiPayload,
  pushToPowerBi,
  recordExportHistory,
} = require('../services/powerBiExportService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenantId = req.query.tenant_id || req.body?.tenant_id || req.user.tenant_db_id;
  const tenant =
    (await findTenantByIdForOwner(tenantId, req.user.sub)) ||
    (await findTenantByHashForOwner(tenantId, req.user.sub));
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

function buildFilters(req, tenantId) {
  return {
    tenantId,
    start: req.query.start || req.body?.start,
    end: req.query.end || req.body?.end,
    channel: req.query.channel || req.body?.channel,
    deploymentType: req.query.deployment_type || req.body?.deployment_type,
  };
}

async function exportPowerBi(req, res) {
  const tenant = await resolveTenant(req);
  const format = req.query.format || 'csv';
  const payload = await buildPowerBiPayload(tenant.id, buildFilters(req, tenant.id));
  await recordExportHistory({
    tenantId: tenant.id,
    requestedBy: req.user.sub,
    exportType: format === 'json' ? 'powerbi_excel' : 'powerbi_csv',
    filters: payload.filters,
  });

  if (format === 'json') {
    return res.json(payload);
  }

  const csv = buildPowerBiCsv(payload);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="powerbi_export_${tenant.tenant_hash.slice(0, 8)}.csv"`);
  return res.send(csv);
}

async function pushPowerBi(req, res) {
  const tenant = await resolveTenant(req);
  const payload = await buildPowerBiPayload(tenant.id, buildFilters(req, tenant.id));
  const result = await pushToPowerBi(payload);
  await recordExportHistory({
    tenantId: tenant.id,
    requestedBy: req.user.sub,
    exportType: 'powerbi_excel',
    filters: payload.filters,
  });
  return res.json({
    mode: 'direct_powerbi',
    ...result,
  });
}

module.exports = { exportPowerBi, pushPowerBi };
