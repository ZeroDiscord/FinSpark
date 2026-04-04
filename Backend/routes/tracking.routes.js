'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const { generateAll, generateJS, generateKotlin, generateDart } = require('../services/codegenService');

async function resolveTenant(tenantParam, userId) {
  const res = await query(
    'SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2',
    [tenantParam, userId]
  );
  return res.rows[0] || null;
}

async function getFeatureNames(tenantDbId) {
  const res = await query(
    'SELECT l3_feature FROM features WHERE tenant_id = $1 ORDER BY confidence DESC LIMIT 100',
    [tenantDbId]
  );
  return res.rows.map(r => r.l3_feature);
}

// GET /api/tracking/:tenantId/snippets?lang=js|kotlin|dart
router.get('/:tenantId/snippets', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const features = await getFeatureNames(tenant.id);
    const { lang } = req.query;

    if (lang === 'js')     return res.json({ js: generateJS(features, tenant.tenant_hash) });
    if (lang === 'kotlin') return res.json({ kotlin: generateKotlin(features, tenant.tenant_hash) });
    if (lang === 'dart')   return res.json({ dart: generateDart(features, tenant.tenant_hash) });

    res.json(generateAll(features, tenant.tenant_hash));
  } catch (err) {
    next(err);
  }
});

// GET /api/tracking/:tenantId/snippets/:lang/download
router.get('/:tenantId/snippets/:lang/download', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const features = await getFeatureNames(tenant.id);
    const { lang } = req.params;

    const map = {
      js:     { fn: generateJS,     filename: 'track.js',             mime: 'application/javascript' },
      kotlin: { fn: generateKotlin, filename: 'FeatureTracker.kt',    mime: 'text/plain' },
      dart:   { fn: generateDart,   filename: 'finspark_tracker.dart', mime: 'text/plain' },
    };

    if (!map[lang]) return res.status(400).json({ error: 'lang must be js, kotlin, or dart.' });

    const { fn, filename, mime } = map[lang];
    const code = fn(features, tenant.tenant_hash);

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(code);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
