'use strict';

const User = require('../database/models/User');
const Tenant = require('../database/models/Tenant');

function normalizeUser(userDoc, tenantDoc = null) {
  if (!userDoc) return null;
  const tenantHash = tenantDoc?.tenant_key || userDoc.tenant_id || null;
  return {
    id: String(userDoc._id),
    email: userDoc.email,
    password_hash: userDoc.password_hash,
    full_name: userDoc.full_name || null,
    role: userDoc.role,
    created_at: userDoc.createdAt || userDoc.created_at || null,
    tenant_db_id: tenantHash,
    tenant_hash: tenantHash,
    company_name: tenantDoc?.company_name || null,
  };
}

async function createUser({ email, passwordHash, fullName, tenantId }) {
  const user = await User.create({
    tenant_id: tenantId,
    email,
    password_hash: passwordHash,
    full_name: fullName || null,
  });

  return normalizeUser(user.toObject());
}

async function findUserByEmail(email) {
  const user = await User.findOne({ email: String(email).toLowerCase() }).lean();
  if (!user) return null;
  const tenant = user.tenant_id ? await Tenant.findOne({ tenant_key: user.tenant_id }).lean() : null;
  return normalizeUser(user, tenant);
}

async function findUserById(id) {
  const user = await User.findById(id).lean();
  if (!user) return null;
  const tenant = user.tenant_id ? await Tenant.findOne({ tenant_key: user.tenant_id }).lean() : null;
  return normalizeUser(user, tenant);
}

module.exports = { createUser, findUserByEmail, findUserById };
