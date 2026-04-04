'use strict';

const DashboardCache = require('../src/database/models/DashboardCache');

async function cacheGet(tenantDbId, cacheKey) {
  const doc = await DashboardCache.findOne({
    tenant_id: tenantDbId,
    cache_key: cacheKey,
    expires_at: { $gt: new Date() },
  }).lean();
  return doc?.payload || null;
}

async function cacheSet(tenantDbId, cacheKey, payload, ttlSeconds = 300) {
  await DashboardCache.findOneAndUpdate(
    { tenant_id: tenantDbId, cache_key: cacheKey },
    {
      $set: {
        payload,
        expires_at: new Date(Date.now() + ttlSeconds * 1000),
      },
    },
    { upsert: true, new: true }
  );
}

async function cacheInvalidateTenant(tenantDbId) {
  await DashboardCache.deleteMany({ tenant_id: tenantDbId });
}

module.exports = { cacheGet, cacheSet, cacheInvalidateTenant };
