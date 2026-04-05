'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const mlClient = require('../services/mlClient');
const { cacheInvalidateTenant } = require('../services/cacheService');
const { listTenantsForOwner, findTenantByIdForOwner } = require('../src/models/TenantModel');
const Tenant = require('../src/database/models/Tenant');

// GET /api/tenants
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const tenants = await listTenantsForOwner(req.user.sub);
    res.json(tenants);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:tenantId
router.get('/:tenantId', requireAuth, async (req, res, next) => {
  try {
    const tenant = await findTenantByIdForOwner(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    let ml_overview = null;
    try {
      const mlRes = await mlClient.get('/dashboard/tenants');
      const tenants = mlRes.data;
      ml_overview = tenants.find((t) => t.tenant_id === tenant.tenant_hash) || null;
    } catch {
      ml_overview = null;
    }

    res.json({ ...tenant, ml_overview });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tenants/:tenantId/consent
// Updates telemetry consent settings for the tenant (admin only).
router.patch('/:tenantId/consent', requireAuth, async (req, res, next) => {
  try {
    const tenant = await findTenantByIdForOwner(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });
    if (req.user.role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update consent settings.' });
    }

    const allowed = ['allow_feature_tracking', 'allow_session_recording', 'allow_pii_collection', 'allow_external_export'];
    const updates = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') {
        updates[`telemetry_consent.${key}`] = req.body[key];
      }
    }
    updates['telemetry_consent.updated_at'] = new Date();
    updates['telemetry_consent.updated_by'] = req.user.sub;

    await Tenant.updateOne({ tenant_key: tenant.id }, { $set: updates });

    // Audit log
    const { AuditLog } = require('../src/database/models');
    await AuditLog.create({
      tenant_id:  tenant.id,
      actor_id:   req.user.sub,
      action:     'consent_updated',
      resource:   'tenant_consent',
      before:     null,
      after:      updates,
    }).catch(() => null);

    await cacheInvalidateTenant(tenant.id);
    return res.json({ updated: true, changes: updates });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:tenantId/train
router.post('/:tenantId/train', requireAuth, async (req, res, next) => {
  try {
    const tenant = await findTenantByIdForOwner(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const mlRes = await mlClient.post('/train', {
      tenant_id: tenant.tenant_hash,
      augment: req.body.augment || false,
    });

    await Tenant.updateOne(
      { tenant_key: tenant.id },
      { $set: { ml_trained: true, trained_at: new Date() } }
    );
    await cacheInvalidateTenant(tenant.id);

    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
