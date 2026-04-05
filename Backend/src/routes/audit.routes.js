'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const AuditLog = require('../database/models/AuditLog');
const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');

// GET /api/audit/:tenantId
// Returns recent audit log entries for a tenant (admin only).
router.get('/:tenantId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const tenant =
    (await findTenantByIdForOwner(req.params.tenantId, req.user.sub)) ||
    (await findTenantByHashForOwner(req.params.tenantId, req.user.sub));
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const logs = await AuditLog.find({ tenant_id: tenant.id })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();

  return res.json({ logs });
}));

module.exports = router;
