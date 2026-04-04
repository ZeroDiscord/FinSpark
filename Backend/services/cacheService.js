'use strict';

const { query } = require('../db/client');

/**
 * Read from dashboard_cache. Returns parsed payload or null if missing/expired.
 */
async function cacheGet(tenantDbId, cacheKey) {
  const res = await query(
    `SELECT payload, cached_at, ttl_seconds
     FROM dashboard_cache
     WHERE tenant_id = $1 AND cache_key = $2`,
    [tenantDbId, cacheKey]
  );
  if (!res.rows.length) return null;
  const { payload, cached_at, ttl_seconds } = res.rows[0];
  const ageSeconds = (Date.now() - new Date(cached_at).getTime()) / 1000;
  if (ageSeconds > ttl_seconds) return null;
  return payload;
}

/**
 * Write to dashboard_cache (upsert).
 */
async function cacheSet(tenantDbId, cacheKey, payload, ttlSeconds = 300) {
  await query(
    `INSERT INTO dashboard_cache (tenant_id, cache_key, payload, ttl_seconds, cached_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id, cache_key)
     DO UPDATE SET payload = EXCLUDED.payload, cached_at = NOW(), ttl_seconds = EXCLUDED.ttl_seconds`,
    [tenantDbId, cacheKey, JSON.stringify(payload), ttlSeconds]
  );
}

/**
 * Invalidate all cache entries for a tenant (called after retraining).
 */
async function cacheInvalidateTenant(tenantDbId) {
  await query('DELETE FROM dashboard_cache WHERE tenant_id = $1', [tenantDbId]);
}

module.exports = { cacheGet, cacheSet, cacheInvalidateTenant };
