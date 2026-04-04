'use strict';

const { stringify } = require('csv-stringify/sync');
const { getDashboardData } = require('./dashboardService');
const { listEventsForTenant } = require('../models/UsageEventModel');

async function buildPowerBiCsv(tenantId, filters = {}) {
  const dashboard = await getDashboardData({ tenantId, ...filters });
  const events = await listEventsForTenant(tenantId, filters);

  return stringify(
    events.map((event) => ({
      session_id: event.session_id,
      user_id: event.user_id,
      timestamp: event.timestamp,
      deployment_type: event.deployment_type,
      channel: event.channel,
      l1_domain: event.l1_domain,
      l2_module: event.l2_module,
      l3_feature: event.l3_feature,
      l4_action: event.l4_action,
      duration_ms: event.duration_ms,
      success: event.success,
      churn_label: event.churn_label,
    })),
    { header: true }
  );
}

module.exports = { buildPowerBiCsv };
