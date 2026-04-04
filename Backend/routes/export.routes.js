'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const { buildCsvExport, streamPowerBIZip } = require('../services/exportService');

async function resolveTenant(tenantParam, userId) {
  const res = await query(
    'SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2',
    [tenantParam, userId]
  );
  return res.rows[0] || null;
}

// GET /api/export/:tenantId/csv?type=features|recommendations|friction|events
router.get('/:tenantId/csv', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const type = req.query.type || 'features';
    const date = new Date().toISOString().split('T')[0];
    const csv = await buildCsvExport(tenant.id, tenant.tenant_hash, type);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="finspark_${type}_${date}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/export/:tenantId/powerbi
router.get('/:tenantId/powerbi', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const date = new Date().toISOString().split('T')[0];
    const shortHash = tenant.tenant_hash.substring(0, 8);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="finspark_powerbi_${shortHash}_${date}.zip"`);

    await streamPowerBIZip(tenant.id, tenant.tenant_hash, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
