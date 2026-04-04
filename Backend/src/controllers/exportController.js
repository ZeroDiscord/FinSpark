'use strict';

const { findTenantByHashForOwner, findTenantByIdForOwner } = require('../models/TenantModel');
const { buildPowerBiCsv } = require('../services/powerBiExportService');
const { NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenantId = req.query.tenant_id || req.user.tenant_db_id;
  const tenant =
    (await findTenantByIdForOwner(tenantId, req.user.sub)) ||
    (await findTenantByHashForOwner(tenantId, req.user.sub));
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

async function exportPowerBi(req, res) {
  const tenant = await resolveTenant(req);
  const csv = await buildPowerBiCsv(tenant.id, {
    start: req.query.start,
    end: req.query.end,
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="powerbi_export_${tenant.tenant_hash.slice(0, 8)}.csv"`
  );
  return res.send(csv);
}

module.exports = { exportPowerBi };
