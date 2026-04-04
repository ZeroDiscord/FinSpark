'use strict';

const UsageEvent = require('../database/models/UsageEvent');
const { predictChurnFromEvents } = require('./mlService');

async function getDashboardData({ tenantId, start, end }) {
  const filter = { tenant_id: tenantId };
  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = new Date(start);
    if (end) filter.timestamp.$lte = new Date(end);
  }

  const [overview, featureUsage, funnelRows, topDropoffRows] = await Promise.all([
    UsageEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_sessions: { $addToSet: '$session_id' },
          active_users: { $addToSet: '$user_id' },
          churn_values: { $push: { $ifNull: ['$churn_label', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          total_sessions: { $size: '$total_sessions' },
          active_users: { $size: '$active_users' },
          churn_rate: { $avg: '$churn_values' },
        },
      },
    ]),
    UsageEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$l3_feature',
          usage_count: { $sum: 1 },
          churn_rate: { $avg: { $ifNull: ['$churn_label', 0] } },
        },
      },
      { $sort: { usage_count: -1 } },
      { $project: { _id: 0, feature: '$_id', usage_count: 1, churn_rate: 1 } },
    ]),
    UsageEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$l3_feature',
          sessions: { $addToSet: '$session_id' },
        },
      },
      { $project: { _id: 0, feature: '$_id', sessions: { $size: '$sessions' } } },
      { $sort: { sessions: -1 } },
      { $limit: 5 },
    ]),
    UsageEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$l3_feature',
          usage_count: { $sum: 1 },
          drop_off_rate: { $avg: { $ifNull: ['$churn_label', 0] } },
        },
      },
      { $sort: { drop_off_rate: -1, usage_count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, feature: '$_id', usage_count: 1, drop_off_rate: 1 } },
    ]),
  ]);

  const stats = overview[0] || { total_sessions: 0, active_users: 0, churn_rate: 0 };

  return {
    total_sessions: Number(stats.total_sessions || 0),
    active_users: Number(stats.active_users || 0),
    churn_rate: Number(stats.churn_rate || 0),
    feature_usage: featureUsage.map((row) => ({
      feature: row.feature,
      usage_count: Number(row.usage_count),
      churn_rate: Number(row.churn_rate || 0),
    })),
    funnel: funnelRows.map((row) => ({
      step: row.feature,
      count: Number(row.sessions),
    })),
    top_drop_off_features: topDropoffRows.map((row) => ({
      feature: row.feature,
      usage_count: Number(row.usage_count),
      drop_off_rate: Number(row.drop_off_rate || 0),
    })),
  };
}

async function predictLatestSessionChurn(tenantId) {
  const events = await UsageEvent.find({ tenant_id: tenantId })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();
  if (!events.length) return null;
  return predictChurnFromEvents(events);
}

module.exports = { getDashboardData, predictLatestSessionChurn };
