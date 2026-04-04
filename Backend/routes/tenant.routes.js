'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const mlClient = require('../services/mlClient');
const { cacheInvalidateTenant } = require('../services/cacheService');

// GET /api/tenants
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, company_name, tenant_hash, plan, ml_trained, trained_at, created_at
       FROM tenants WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.user.sub]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:tenantId  (tenantId = tenant DB UUID)
router.get('/:tenantId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, company_name, tenant_hash, plan, ml_trained, trained_at, created_at
       FROM tenants WHERE id = $1 AND owner_id = $2`,
      [req.params.tenantId, req.user.sub]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const tenant = result.rows[0];

    // Try to fetch ML overview for this tenant
    let ml_overview = null;
    try {
      const mlRes = await mlClient.get(`/dashboard/tenants`);
      const tenants = mlRes.data;
      ml_overview = tenants.find(t => t.tenant_id === tenant.tenant_hash) || null;
    } catch {
      // ML might not have this tenant trained yet
    }

    res.json({ ...tenant, ml_overview });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:tenantId/train
router.post('/:tenantId/train', requireAuth, async (req, res, next) => {
  try {
    const tenantRes = await query(
      'SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2',
      [req.params.tenantId, req.user.sub]
    );
    if (!tenantRes.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const tenant = tenantRes.rows[0];

    const mlRes = await mlClient.post('/train', {
      tenant_id: tenant.tenant_hash,
      augment: req.body.augment || false,
    });

    await query(
      'UPDATE tenants SET ml_trained = TRUE, trained_at = NOW() WHERE id = $1',
      [tenant.id]
    );
    await cacheInvalidateTenant(tenant.id);

    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
