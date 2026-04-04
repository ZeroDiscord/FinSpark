'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const mlClient = require('../../services/mlClient');
const { cacheGet, cacheSet } = require('../../services/cacheService');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const { listFeaturesByTenant } = require('../models/DetectedFeatureModel');

async function resolveTenant(tenantParam, userId) {
  return (
    (await findTenantByIdForOwner(tenantParam, userId)) ||
    (await findTenantByHashForOwner(tenantParam, userId))
  );
}

// GET /api/features/:tenantId/friction
router.get('/:tenantId/friction', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const cached = await cacheGet(tenant.id, 'friction');
  if (cached) return res.json(cached);

  const mlRes = await mlClient.get('/features/friction', {
    params: { tenant_id: tenant.tenant_hash },
  });
  await cacheSet(tenant.id, 'friction', mlRes.data, 300);
  return res.json(mlRes.data);
}));

// GET /api/features/:tenantId/cooccurrence?feature=name&top_k=5
router.get('/:tenantId/cooccurrence', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const { feature, top_k = 5 } = req.query;
  if (!feature) return res.status(400).json({ error: 'feature query param required.' });

  const mlRes = await mlClient.get('/features/cooccurrence', {
    params: { tenant_id: tenant.tenant_hash, feature_id: feature, top_k },
  });
  return res.json(mlRes.data);
}));

// GET /api/features/:tenantId  (list features with pagination)
router.get('/:tenantId', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const { source, page = 1, limit = 50 } = req.query;
  const pageNumber = parseInt(page, 10);
  const pageSize = parseInt(limit, 10);
  const offset = (pageNumber - 1) * pageSize;

  let features = await listFeaturesByTenant(tenant.id);
  if (source) features = features.filter((item) => item.source_type === source);

  return res.json({
    features: features.slice(offset, offset + pageSize),
    total: features.length,
    page: pageNumber,
  });
}));

module.exports = router;
