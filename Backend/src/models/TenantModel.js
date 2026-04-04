'use strict';

const { query } = require('../../db/client');

async function createTenant({ ownerId, companyName, tenantHash }) {
  const result = await query(
    `INSERT INTO tenants (owner_id, company_name, tenant_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [ownerId, companyName, tenantHash]
  );
  return result.rows[0];
}

async function findTenantByIdForOwner(id, ownerId) {
  const result = await query(
    `SELECT * FROM tenants WHERE id = $1 AND owner_id = $2 LIMIT 1`,
    [id, ownerId]
  );
  return result.rows[0] || null;
}

async function findTenantByHashForOwner(tenantHash, ownerId) {
  const result = await query(
    `SELECT * FROM tenants WHERE tenant_hash = $1 AND owner_id = $2 LIMIT 1`,
    [tenantHash, ownerId]
  );
  return result.rows[0] || null;
}

async function listTenantsForOwner(ownerId) {
  const result = await query(
    `SELECT id, company_name, tenant_hash, plan, ml_trained, trained_at, created_at
     FROM tenants
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

module.exports = {
  createTenant,
  findTenantByIdForOwner,
  findTenantByHashForOwner,
  listTenantsForOwner,
};
