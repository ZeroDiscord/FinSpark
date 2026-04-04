'use strict';

const { query } = require('../../db/client');
const { predictChurnFromEvents } = require('./mlService');

async function getDashboardData({ tenantId, start, end }) {
  const params = [tenantId];
  let dateClause = '';
  if (start) {
    params.push(start);
    dateClause += ` AND timestamp >= $${params.length}`;
  }
  if (end) {
    params.push(end);
    dateClause += ` AND timestamp <= $${params.length}`;
  }

  const [overview, featureUsage, funnelRows, topDropoffRows] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT session_id) AS total_sessions,
              COUNT(DISTINCT user_id) AS active_users,
              COALESCE(AVG(churn_label::decimal), 0) AS churn_rate
       FROM events
       WHERE tenant_id = $1${dateClause}`,
      params
    ),
    query(
      `SELECT l3_feature AS feature, COUNT(*)::int AS usage_count,
              COALESCE(AVG(churn_label::decimal), 0) AS churn_rate
       FROM events
       WHERE tenant_id = $1${dateClause}
       GROUP BY l3_feature
       ORDER BY usage_count DESC`,
      params
    ),
    query(
      `SELECT l3_feature AS feature, COUNT(DISTINCT session_id)::int AS sessions
       FROM events
       WHERE tenant_id = $1${dateClause}
       GROUP BY l3_feature
       ORDER BY sessions DESC
       LIMIT 5`,
      params
    ),
    query(
      `SELECT l3_feature AS feature,
              COUNT(*)::int AS usage_count,
              COALESCE(AVG(churn_label::decimal), 0) AS drop_off_rate
       FROM events
       WHERE tenant_id = $1${dateClause}
       GROUP BY l3_feature
       ORDER BY drop_off_rate DESC, usage_count DESC
       LIMIT 10`,
      params
    ),
  ]);

  const totalSessions = Number(overview.rows[0]?.total_sessions || 0);
  const activeUsers = Number(overview.rows[0]?.active_users || 0);
  const churnRate = Number(overview.rows[0]?.churn_rate || 0);

  return {
    total_sessions: totalSessions,
    active_users: activeUsers,
    churn_rate: churnRate,
    feature_usage: featureUsage.rows.map((row) => ({
      feature: row.feature,
      usage_count: Number(row.usage_count),
      churn_rate: Number(row.churn_rate),
    })),
    funnel: funnelRows.rows.map((row) => ({
      step: row.feature,
      count: Number(row.sessions),
    })),
    top_drop_off_features: topDropoffRows.rows.map((row) => ({
      feature: row.feature,
      usage_count: Number(row.usage_count),
      drop_off_rate: Number(row.drop_off_rate),
    })),
  };
}

async function predictLatestSessionChurn(tenantId) {
  const result = await query(
    `SELECT session_id, l3_feature, duration_ms, success, timestamp
     FROM events
     WHERE tenant_id = $1
     ORDER BY timestamp DESC
     LIMIT 20`,
    [tenantId]
  );
  if (!result.rows.length) return null;
  return predictChurnFromEvents(result.rows);
}

module.exports = { getDashboardData, predictLatestSessionChurn };
