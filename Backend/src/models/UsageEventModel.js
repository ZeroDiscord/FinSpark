'use strict';

const UsageEvent = require('../database/models/UsageEvent');

async function insertUsageEvents(tenantId, rows) {
  if (!rows.length) return [];

  const docs = rows.map((row) => ({
    tenant_id: tenantId,
    session_id: row.session_id,
    user_id: row.user_id,
    timestamp: row.timestamp,
    deployment_type: row.deployment_type,
    channel: row.channel,
    l1_domain: row.l1_domain,
    l2_module: row.l2_module,
    l3_feature: row.l3_feature,
    l4_action: row.l4_action,
    l5_deployment_node: row.l5_deployment_node,
    duration_ms: row.duration_ms,
    success: row.success,
    metadata: row.metadata || {},
    feedback_text: row.feedback_text,
    churn_label: row.churn_label,
  }));

  await UsageEvent.insertMany(docs, { ordered: false });
  return rows;
}

async function listEventsForTenant(tenantId, { start, end } = {}) {
  const filter = { tenant_id: tenantId };
  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = new Date(start);
    if (end) filter.timestamp.$lte = new Date(end);
  }

  return UsageEvent.find(filter).sort({ timestamp: -1 }).lean();
}

module.exports = { insertUsageEvents, listEventsForTenant };
