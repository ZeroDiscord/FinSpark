/**
 * Sync Service for Federated Analytics
 * 
 * For On-Prem deployments: Runs periodically to aggregate telemetry 
 * and model weights, then pushes them to the Cloud Dashboard securely.
 */

const axios = require('axios');
const db = require('../db');

class SyncService {
  constructor(cloudEndpoint, tenantId, syncIntervalMs = 86400000) {
    this.cloudEndpoint = cloudEndpoint || 'https://api.finspark.cloud/federated/aggregate';
    this.tenantId = tenantId;
    this.syncIntervalMs = syncIntervalMs;
    this.timer = null;
  }

  start() {
    console.log(`[SyncService] Started background sync for tenant ${this.tenantId}`);
    this.timer = setInterval(() => this.runSync(), this.syncIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSync() {
    console.log(`[SyncService] Running scheduled synchronization...`);
    try {
      // 1. Gather anonymized aggregated event counts (no PII, no raw user_id/session_id)
      const aggregatesQuery = `
        SELECT l3_feature, COUNT(*) as usage_count, 
               COUNT(NULLIF(success, true)) as error_count
        FROM events
        WHERE tenant_id = $1 AND timestamp >= NOW() - INTERVAL '1 day'
        GROUP BY l3_feature
      `;
      const { rows } = await db.query(aggregatesQuery, [this.tenantId]);

      const payload = {
        tenant_id: this.tenantId,
        timestamp: new Date().toISOString(),
        payload_type: 'event_aggregates',
        data: rows
      };

      // 2. Push to Cloud
      await axios.post(this.cloudEndpoint, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`[SyncService] Successfully synced ${rows.length} aggregated feature metrics.`);

      // (Note: ML model weight syncing is handled by the ML backend via /federated/aggregate)
    } catch (error) {
      console.error(`[SyncService] Synchronization failed:`, error.message);
    }
  }
}

module.exports = SyncService;
