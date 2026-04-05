'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const controller = require('../controllers/exportController');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const { buildPowerBiPayload, buildPowerBiCsv, recordExportHistory } = require('../services/powerBiExportService');

async function resolveTenant(tenantParam, userId) {
  return (
    (await findTenantByIdForOwner(tenantParam, userId)) ||
    (await findTenantByHashForOwner(tenantParam, userId))
  );
}

router.get('/powerbi', requireAuth, requireRole('admin', 'analyst', 'ops'), asyncHandler(controller.exportPowerBi));
router.post('/powerbi/push', requireAuth, requireRole('admin', 'ops'), asyncHandler(controller.pushPowerBi));

// GET /api/export/:tenantId/csv?type=features|recommendations|friction|events
router.get('/:tenantId/csv', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const type = req.query.type || 'features';
  const date = new Date().toISOString().split('T')[0];
  const payload = await buildPowerBiPayload(tenant.id, { tenantId: tenant.id });
  const csv = buildPowerBiCsv(payload);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="finspark_${type}_${date}.csv"`);
  return res.send(csv);
}));

// GET /api/export/:tenantId/powerbi  (ZIP download)
router.get('/:tenantId/powerbi', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const payload = await buildPowerBiPayload(tenant.id, { tenantId: tenant.id });
  const csv = buildPowerBiCsv(payload);
  const date = new Date().toISOString().split('T')[0];
  const shortHash = tenant.tenant_hash.substring(0, 8);

  await recordExportHistory({
    tenantId: tenant.id,
    requestedBy: req.user.sub,
    exportType: 'powerbi_csv',
    filters: {},
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="finspark_powerbi_${shortHash}_${date}.csv"`);
  return res.send(csv);
}));

module.exports = router;
