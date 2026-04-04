'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const mlClient = require('../services/mlClient');
const { cacheGet, cacheSet } = require('../services/cacheService');

// Resolve tenantDbId from route param (UUID) or from JWT
async function resolveTenant(tenantParam, userId) {
  const res = await query(
    `SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2`,
    [tenantParam, userId]
  );
  return res.rows[0] || null;
}

// GET /api/features/:tenantId
router.get('/:tenantId', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { source, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `SELECT id, name, l3_feature, l2_module, l1_domain, source_type, confidence, created_at
               FROM features WHERE tenant_id = $1`;
    const params = [tenant.id];

    if (source) {
      sql += ` AND source_type = $${params.length + 1}`;
      params.push(source);
    }

    const countRes = await query(sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM').split('ORDER')[0], params);
    sql += ` ORDER BY confidence DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const dataRes = await query(sql, params);
    res.json({
      features: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count || 0),
      page: parseInt(page),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/features/:tenantId/friction
router.get('/:tenantId/friction', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const cached = await cacheGet(tenant.id, 'friction');
    if (cached) return res.json(cached);

    const mlRes = await mlClient.get('/features/friction', {
      params: { tenant_id: tenant.tenant_hash },
    });

    await cacheSet(tenant.id, 'friction', mlRes.data, 300);
    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

// GET /api/features/:tenantId/cooccurrence?feature=name&top_k=5
router.get('/:tenantId/cooccurrence', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { feature, top_k = 5 } = req.query;
    if (!feature) return res.status(400).json({ error: 'feature query param required.' });

    const mlRes = await mlClient.get('/features/cooccurrence', {
      params: { tenant_id: tenant.tenant_hash, feature_id: feature, top_k },
    });
    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
