'use strict';

const { query } = require('../../db/client');

async function insertUsageEvents(tenantId, rows) {
  if (!rows.length) return [];

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 15;
    values.push(
      tenantId,
      row.session_id,
      row.user_id,
      row.timestamp,
      row.deployment_type,
      row.channel,
      row.l1_domain,
      row.l2_module,
      row.l3_feature,
      row.l4_action,
      row.l5_deployment_node,
      row.duration_ms,
      row.success,
      JSON.stringify(row.metadata || {}),
      row.feedback_text,
      row.churn_label
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`;
  });

  await query(
    `INSERT INTO events (
      tenant_id, session_id, user_id, timestamp, deployment_type, channel, l1_domain, l2_module,
      l3_feature, l4_action, l5_deployment_node, duration_ms, success, metadata, feedback_text, churn_label
    ) VALUES ${placeholders.join(', ')}`,
    values
  );

  return rows;
}

async function listEventsForTenant(tenantId, { start, end } = {}) {
  const params = [tenantId];
  let sql = `SELECT * FROM events WHERE tenant_id = $1`;
  if (start) {
    params.push(start);
    sql += ` AND timestamp >= $${params.length}`;
  }
  if (end) {
    params.push(end);
    sql += ` AND timestamp <= $${params.length}`;
  }
  sql += ` ORDER BY timestamp DESC`;
  const result = await query(sql, params);
  return result.rows;
}

module.exports = { insertUsageEvents, listEventsForTenant };
