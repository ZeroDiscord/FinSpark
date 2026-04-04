'use strict';

const Tenant = require('../database/models/Tenant');
const User = require('../database/models/User');

function normalizeTenant(tenantDoc) {
  if (!tenantDoc) return null;
  return {
    id: tenantDoc.tenant_key,
    tenant_hash: tenantDoc.tenant_key,
    company_name: tenantDoc.company_name,
    plan: tenantDoc.plan,
    ml_trained: Boolean(tenantDoc.ml_trained),
    trained_at: tenantDoc.trained_at || null,
    created_at: tenantDoc.createdAt || tenantDoc.created_at || null,
    deployment_mode: tenantDoc.deployment_mode,
    status: tenantDoc.status,
    settings: tenantDoc.settings || {},
  };
}

async function createTenant({ companyName, tenantHash }) {
  const tenant = await Tenant.create({
    tenant_key: tenantHash,
    company_name: companyName,
  });

  return normalizeTenant(tenant.toObject());
}

async function findTenantByIdForOwner(id, ownerId) {
  const user = await User.findById(ownerId).lean();
  if (!user?.tenant_id) return null;

  // Try matching by tenant_key first (the common case), then by _id only if it
  // looks like a valid ObjectId to avoid a Mongoose CastError.
  const mongoose = require('mongoose');
  const isObjectId = mongoose.isValidObjectId(id);
  const orClause = isObjectId
    ? [{ tenant_key: String(id) }, { _id: id }]
    : [{ tenant_key: String(id) }];

  const tenant = await Tenant.findOne({
    tenant_key: user.tenant_id,
    $or: orClause,
  }).lean();

  return normalizeTenant(tenant);
}

async function findTenantByHashForOwner(tenantHash, ownerId) {
  const user = await User.findById(ownerId).lean();
  if (!user?.tenant_id || user.tenant_id !== String(tenantHash)) return null;

  const tenant = await Tenant.findOne({ tenant_key: String(tenantHash) }).lean();
  return normalizeTenant(tenant);
}

async function listTenantsForOwner(ownerId) {
  const user = await User.findById(ownerId).lean();
  if (!user?.tenant_id) return [];

  const tenant = await Tenant.findOne({ tenant_key: user.tenant_id }).lean();
  return tenant ? [normalizeTenant(tenant)] : [];
}

module.exports = {
  createTenant,
  findTenantByIdForOwner,
  findTenantByHashForOwner,
  listTenantsForOwner,
};
