'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { generateAll, generateJS, generateKotlin, generateDart } = require('../services/codegenService');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../src/models/TenantModel');
const { listFeaturesByTenant } = require('../src/models/DetectedFeatureModel');

async function resolveTenant(tenantParam, userId) {
  return (
    (await findTenantByIdForOwner(tenantParam, userId)) ||
    (await findTenantByHashForOwner(tenantParam, userId))
  );
}

async function getFeatureNames(tenantId) {
  const features = await listFeaturesByTenant(tenantId);
  return features.slice(0, 100).map((row) => row.l3_feature);
}

// GET /api/tracking/:tenantId/snippets?lang=js|kotlin|dart
router.get('/:tenantId/snippets', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const features = await getFeatureNames(tenant.id);
    const { lang } = req.query;

    if (lang === 'js') return res.json({ js: generateJS(features, tenant.tenant_hash) });
    if (lang === 'kotlin') return res.json({ kotlin: generateKotlin(features, tenant.tenant_hash) });
    if (lang === 'dart') return res.json({ dart: generateDart(features, tenant.tenant_hash) });

    res.json(generateAll(features, tenant.tenant_hash));
  } catch (err) {
    next(err);
  }
});


module.exports = router;
