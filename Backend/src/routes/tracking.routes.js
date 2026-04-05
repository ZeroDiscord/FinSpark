'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/trackingController');
const { generateAll, generateJS, generateReact, generateNode, generatePython, generateGo, generateJava, generateKotlin, generateDart } = require('../../services/codegenService');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const { listFeaturesByTenant } = require('../models/DetectedFeatureModel');

async function resolveTenant(tenantParam, userId) {
  return (
    (await findTenantByIdForOwner(tenantParam, userId)) ||
    (await findTenantByHashForOwner(tenantParam, userId))
  );
}

async function getFeatures(tenantId) {
  const features = await listFeaturesByTenant(tenantId);
  return features.slice(0, 100).map((row) => ({
    l1_domain: row.l1_domain || 'App',
    l2_module: row.l2_module || 'General',
    l3_feature: row.l3_feature,
  }));
}

router.post('/generate', requireAuth, asyncHandler(controller.generateTracking));

// GET /api/tracking/:tenantId/snippets?lang=js|kotlin|dart
router.get('/:tenantId/snippets', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const features = await getFeatures(tenant.id);
  const { lang } = req.query;

  if (lang === 'js')     return res.json({ js:     generateJS(features, tenant.tenant_hash) });
  if (lang === 'react')  return res.json({ react:  generateReact(features, tenant.tenant_hash) });
  if (lang === 'node')   return res.json({ node:   generateNode(features, tenant.tenant_hash) });
  if (lang === 'python') return res.json({ python: generatePython(features, tenant.tenant_hash) });
  if (lang === 'go')     return res.json({ go:     generateGo(features, tenant.tenant_hash) });
  if (lang === 'java')   return res.json({ java:   generateJava(features, tenant.tenant_hash) });
  if (lang === 'kotlin') return res.json({ kotlin: generateKotlin(features, tenant.tenant_hash) });
  if (lang === 'dart')   return res.json({ dart:   generateDart(features, tenant.tenant_hash) });

  return res.json(generateAll(features, tenant.tenant_hash));
}));


module.exports = router;
