'use strict';

const {
  UsageEvent,
  ProcessedSession,
  MlPrediction,
  Recommendation,
} = require('../../database/models');

const DEFAULT_FUNNEL_STEPS = ['Apply Loan', 'Upload Documents', 'Credit Check', 'Approval'];
const STRATEGIC_FEATURES = new Set(['Upload Documents', 'Credit Check', 'Loan Approval', 'EMI Calculator']);
const CHURN_THRESHOLD = 0.7;

function buildDateFilter(start, end) {
  if (!start && !end) return null;
  const filter = {};
  if (start) filter.$gte = new Date(start);
  if (end) filter.$lte = new Date(end);
  return filter;
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function getIsoWeekKey(input) {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getSessionIdentity(session) {
  return session.user_id || session.session_id;
}

function normalizeStepList(steps) {
  if (Array.isArray(steps) && steps.length) {
    return steps.map((step) => String(step || '').trim()).filter(Boolean);
  }
  if (typeof steps === 'string' && steps.trim()) {
    return steps
      .split(',')
      .map((step) => step.trim())
      .filter(Boolean);
  }
  return DEFAULT_FUNNEL_STEPS;
}

function buildEventFilter({ tenantId, start, end, channel, deploymentType, feature }) {
  const filter = { tenant_id: tenantId };
  const dateFilter = buildDateFilter(start, end);
  if (dateFilter) filter.timestamp = dateFilter;
  if (channel) filter.channel = channel;
  if (deploymentType) filter.deployment_type = deploymentType;
  if (feature) filter.l3_feature = feature;
  return filter;
}

function buildSessionFilter({ tenantId, start, end, feature }) {
  const filter = { tenant_id: tenantId };
  const dateFilter = buildDateFilter(start, end);
  if (dateFilter) filter.session_start = dateFilter;
  if (feature) filter.feature_sequence = feature;
  return filter;
}

function buildPredictionFilter({ tenantId, start, end }) {
  const filter = { tenant_id: tenantId };
  const dateFilter = buildDateFilter(start, end);
  if (dateFilter) filter.created_at = dateFilter;
  return filter;
}

async function loadAnalyticsData({ tenantId, start, end, channel, deploymentType, feature }) {
  const [events, sessions, predictions, recommendations] = await Promise.all([
    UsageEvent.find(buildEventFilter({ tenantId, start, end, channel, deploymentType, feature }))
      .sort({ timestamp: 1 })
      .lean(),
    ProcessedSession.find(buildSessionFilter({ tenantId, start, end, feature }))
      .sort({ session_start: 1 })
      .lean(),
    MlPrediction.find(buildPredictionFilter({ tenantId, start, end }))
      .sort({ session_id: 1, created_at: -1 })
      .lean(),
    Recommendation.find({ tenant_id: tenantId, status: { $in: ['open', 'sent'] } })
      .sort({ impact_score: -1, created_at: -1 })
      .lean(),
  ]);

  return { events, sessions, predictions, recommendations };
}

function getLatestPredictionMap(predictions) {
  const map = new Map();
  for (const prediction of predictions) {
    if (!map.has(prediction.session_id)) {
      map.set(prediction.session_id, prediction);
    }
  }
  return map;
}

function isSessionChurned(session, prediction) {
  return Number(prediction?.churn_probability || 0) >= CHURN_THRESHOLD || Number(session?.churn_label || 0) === 1;
}

function buildSessionEventMap(events) {
  const map = new Map();
  for (const event of events) {
    if (!map.has(event.session_id)) map.set(event.session_id, []);
    map.get(event.session_id).push(event);
  }
  return map;
}

function getFeatureUsageBreakdown(events, scopedSessionCount) {
  const featureMap = new Map();
  const tenantMap = new Map();
  const deploymentMap = new Map();

  for (const event of events) {
    const feature = event.l3_feature || 'Unknown Feature';
    if (!featureMap.has(feature)) {
      featureMap.set(feature, {
        feature,
        usage_count: 0,
        session_ids: new Set(),
        user_ids: new Set(),
        duration_sum: 0,
        failure_count: 0,
        success_count: 0,
        feedback_count: 0,
        retry_sessions: 0,
        by_tenant: new Map(),
        by_deployment: new Map(),
      });
    }

    const row = featureMap.get(feature);
    row.usage_count += 1;
    row.session_ids.add(event.session_id);
    if (event.user_id) row.user_ids.add(event.user_id);
    row.duration_sum += Number(event.duration_ms || 0);
    if (event.success === false) row.failure_count += 1;
    if (event.success !== false) row.success_count += 1;
    if (String(event.feedback_text || '').trim()) row.feedback_count += 1;
    row.by_tenant.set(event.tenant_id, (row.by_tenant.get(event.tenant_id) || 0) + 1);
    row.by_deployment.set(
      event.deployment_type || 'unknown',
      (row.by_deployment.get(event.deployment_type || 'unknown') || 0) + 1
    );

    tenantMap.set(event.tenant_id, (tenantMap.get(event.tenant_id) || 0) + 1);
    deploymentMap.set(event.deployment_type || 'unknown', (deploymentMap.get(event.deployment_type || 'unknown') || 0) + 1);
  }

  return {
    rows: [...featureMap.values()]
      .map((row) => ({
        feature: row.feature,
        usage_count: row.usage_count,
        adoption_percentage: scopedSessionCount ? round((row.session_ids.size / scopedSessionCount) * 100, 2) : 0,
        unique_sessions: row.session_ids.size,
        unique_users: row.user_ids.size,
        avg_duration_ms: row.usage_count ? Math.round(row.duration_sum / row.usage_count) : 0,
        failure_rate: row.usage_count ? round(row.failure_count / row.usage_count) : 0,
        success_rate: row.usage_count ? round(row.success_count / row.usage_count) : 0,
        negative_feedback_rate: row.usage_count ? round(row.feedback_count / row.usage_count) : 0,
        usage_by_tenant: [...row.by_tenant.entries()].map(([tenant_id, usage_count]) => ({ tenant_id, usage_count })),
        usage_by_deployment_type: [...row.by_deployment.entries()].map(([deployment_type, usage_count]) => ({
          deployment_type,
          usage_count,
        })),
      }))
      .sort((a, b) => b.usage_count - a.usage_count),
    tenant_totals: [...tenantMap.entries()].map(([tenant_id, usage_count]) => ({ tenant_id, usage_count })),
    deployment_totals: [...deploymentMap.entries()].map(([deployment_type, usage_count]) => ({ deployment_type, usage_count })),
  };
}

function computeKpis({ events, sessions, latestPredictions }) {
  const sessionIds = new Set(events.map((item) => item.session_id));
  const userIds = new Set(events.map((item) => item.user_id).filter(Boolean));
  const featureCounts = new Map();
  for (const event of events) {
    const feature = event.l3_feature || 'Unknown Feature';
    featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
  }

  const featureRows = [...featureCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sessionMap = new Map(sessions.map((session) => [session.session_id, session]));
  const churnedSessions = [...sessionIds].filter((sessionId) =>
    isSessionChurned(sessionMap.get(sessionId), latestPredictions.get(sessionId))
  ).length;

  const avgSessionDuration = sessions.length
    ? Math.round(sessions.reduce((sum, item) => sum + Number(item.session_length_ms || 0), 0) / sessions.length)
    : 0;

  return {
    total_sessions: sessionIds.size,
    active_users: userIds.size,
    total_features_used: featureCounts.size,
    churn_rate: sessionIds.size ? round(churnedSessions / sessionIds.size) : 0,
    avg_session_duration_ms: avgSessionDuration,
    most_used_feature: featureRows[0]?.[0] || null,
    least_used_feature: featureRows.length ? featureRows[featureRows.length - 1][0] : null,
  };
}

function computeFeatureUsage({ events, sessions, groupBy }) {
  const scopedSessionCount = new Set(sessions.map((session) => session.session_id)).size || 1;
  const breakdown = getFeatureUsageBreakdown(events, scopedSessionCount);

  if (groupBy === 'tenant') return breakdown.tenant_totals;
  if (groupBy === 'deployment_type') return breakdown.deployment_totals;
  return breakdown.rows;
}

function computeChurnAnalytics({ events, sessions, latestPredictions }) {
  const sessionEventMap = buildSessionEventMap(events);
  const featureMap = new Map();
  const moduleMap = new Map();
  const tenantMap = new Map();
  const channelMap = new Map();
  const dropOffMap = new Map();

  for (const session of sessions) {
    const prediction = latestPredictions.get(session.session_id);
    const churned = isSessionChurned(session, prediction);
    const features = new Set(session.feature_sequence || []);

    for (const feature of features) {
      if (!featureMap.has(feature)) {
        featureMap.set(feature, { feature, sessions: 0, churned: 0, churn_sum: 0 });
      }
      const row = featureMap.get(feature);
      row.sessions += 1;
      if (churned) row.churned += 1;
      row.churn_sum += Number(prediction?.churn_probability || 0);
    }

    const seenModules = new Set();
    const seenChannels = new Set();
    const sessionEvents = sessionEventMap.get(session.session_id) || [];
    for (const event of sessionEvents) {
      const module = event.l2_module || 'Unknown Module';
      if (!seenModules.has(module)) {
        seenModules.add(module);
        if (!moduleMap.has(module)) moduleMap.set(module, { module, sessions: 0, churned: 0 });
        const moduleRow = moduleMap.get(module);
        moduleRow.sessions += 1;
        if (churned) moduleRow.churned += 1;
      }

      const channel = event.channel || 'unknown';
      if (!seenChannels.has(channel)) {
        seenChannels.add(channel);
        if (!channelMap.has(channel)) channelMap.set(channel, { channel, sessions: 0, churned: 0 });
        const channelRow = channelMap.get(channel);
        channelRow.sessions += 1;
        if (churned) channelRow.churned += 1;
      }
    }

    const tenantKey = session.tenant_id;
    if (!tenantMap.has(tenantKey)) tenantMap.set(tenantKey, { tenant_id: tenantKey, sessions: 0, churned: 0 });
    const tenantRow = tenantMap.get(tenantKey);
    tenantRow.sessions += 1;
    if (churned) tenantRow.churned += 1;

    const dropOffFeature = prediction?.drop_off_feature || session.drop_off_feature;
    if (dropOffFeature) {
      if (!dropOffMap.has(dropOffFeature)) {
        dropOffMap.set(dropOffFeature, { feature: dropOffFeature, drop_off_count: 0, churned: 0, churn_sum: 0 });
      }
      const dropRow = dropOffMap.get(dropOffFeature);
      dropRow.drop_off_count += 1;
      if (churned) dropRow.churned += 1;
      dropRow.churn_sum += Number(prediction?.churn_probability || 0);
    }
  }

  return {
    churn_by_feature: [...featureMap.values()]
      .map((row) => ({
        feature: row.feature,
        session_count: row.sessions,
        high_churn_sessions: row.churned,
        churn_rate: row.sessions ? round(row.churned / row.sessions) : 0,
        avg_churn_probability: row.sessions ? round(row.churn_sum / row.sessions) : 0,
      }))
      .sort((a, b) => b.churn_rate - a.churn_rate),
    churn_by_module: [...moduleMap.values()]
      .map((row) => ({
        module: row.module,
        session_count: row.sessions,
        churn_rate: row.sessions ? round(row.churned / row.sessions) : 0,
      }))
      .sort((a, b) => b.churn_rate - a.churn_rate),
    churn_by_tenant: [...tenantMap.values()]
      .map((row) => ({
        tenant_id: row.tenant_id,
        session_count: row.sessions,
        churn_rate: row.sessions ? round(row.churned / row.sessions) : 0,
      }))
      .sort((a, b) => b.churn_rate - a.churn_rate),
    churn_by_channel: [...channelMap.values()]
      .map((row) => ({
        channel: row.channel,
        session_count: row.sessions,
        churn_rate: row.sessions ? round(row.churned / row.sessions) : 0,
      }))
      .sort((a, b) => b.churn_rate - a.churn_rate),
    top_drop_off_features: [...dropOffMap.values()]
      .map((row) => ({
        feature: row.feature,
        drop_off_count: row.drop_off_count,
        churn_rate: row.drop_off_count ? round(row.churned / row.drop_off_count) : 0,
        avg_churn_probability: row.drop_off_count ? round(row.churn_sum / row.drop_off_count) : 0,
      }))
      .sort((a, b) => b.drop_off_count - a.drop_off_count),
  };
}

function sessionReachedOrderedSteps(sequence, steps) {
  let pointer = 0;
  for (const feature of sequence || []) {
    if (feature === steps[pointer]) pointer += 1;
    if (pointer === steps.length) break;
  }
  return pointer;
}

function computeFunnel({ sessions, steps }) {
  const orderedSteps = normalizeStepList(steps);
  const counts = orderedSteps.map(() => new Set());

  for (const session of sessions) {
    const identity = getSessionIdentity(session);
    const reached = sessionReachedOrderedSteps(session.feature_sequence || [], orderedSteps);
    for (let index = 0; index < reached; index += 1) {
      counts[index].add(identity);
    }
  }

  const firstCount = counts[0]?.size || 0;
  const rows = orderedSteps.map((step, index) => {
    const users = counts[index]?.size || 0;
    const prevUsers = index === 0 ? users : counts[index - 1]?.size || 0;
    return {
      step,
      users,
      conversion_percentage: firstCount ? round((users / firstCount) * 100, 2) : 0,
      drop_off_percentage: index === 0 || !prevUsers ? 0 : round(((prevUsers - users) / prevUsers) * 100, 2),
    };
  });

  const biggestDrop = rows.slice(1).sort((a, b) => b.drop_off_percentage - a.drop_off_percentage)[0] || null;
  return {
    steps: rows,
    biggest_drop_off_step: biggestDrop?.step || null,
  };
}

function computeJourneys({ sessions, latestPredictions, limit }) {
  const pathMap = new Map();

  for (const session of sessions) {
    const prediction = latestPredictions.get(session.session_id);
    const pathArray = [...(session.feature_sequence || [])];
    if (isSessionChurned(session, prediction)) pathArray.push('CHURN');
    if (!pathArray.length) continue;

    const pathKey = pathArray.join(' -> ');
    if (!pathMap.has(pathKey)) {
      pathMap.set(pathKey, {
        path: pathArray,
        session_count: 0,
        duration_sum: 0,
        churn_sum: 0,
        churned: 0,
        drop_off_feature: null,
      });
    }

    const row = pathMap.get(pathKey);
    row.session_count += 1;
    row.duration_sum += Number(session.session_length_ms || 0);
    row.churn_sum += Number(prediction?.churn_probability || 0);
    if (isSessionChurned(session, prediction)) row.churned += 1;
    row.drop_off_feature = prediction?.drop_off_feature || session.drop_off_feature || row.drop_off_feature;
  }

  const rows = [...pathMap.values()].map((row) => ({
    path: row.path,
    session_count: row.session_count,
    avg_duration_ms: row.session_count ? Math.round(row.duration_sum / row.session_count) : 0,
    avg_churn_probability: row.session_count ? round(row.churn_sum / row.session_count) : 0,
    high_churn_rate: row.session_count ? round(row.churned / row.session_count) : 0,
    drop_off_feature: row.drop_off_feature,
  }));

  return {
    most_common_paths: [...rows].sort((a, b) => b.session_count - a.session_count).slice(0, limit),
    highest_churn_paths: [...rows].sort((a, b) => b.avg_churn_probability - a.avg_churn_probability).slice(0, limit),
  };
}

function computeTimeInsights({ events, sessions, latestPredictions }) {
  const daily = new Map();
  const weekly = new Map();
  const monthlyUsage = new Map();
  const monthlyTotals = new Map();
  const hours = new Map();

  for (const event of events) {
    const timestamp = new Date(event.timestamp);
    const dayKey = timestamp.toISOString().slice(0, 10);
    const monthKey = timestamp.toISOString().slice(0, 7);
    const hour = timestamp.getUTCHours();
    const monthlyFeatureKey = `${monthKey}:${event.l3_feature}`;

    if (!daily.has(dayKey)) daily.set(dayKey, { date: dayKey, event_count: 0, sessions: new Set() });
    const dailyRow = daily.get(dayKey);
    dailyRow.event_count += 1;
    dailyRow.sessions.add(event.session_id);

    hours.set(hour, (hours.get(hour) || 0) + 1);

    if (!monthlyUsage.has(monthlyFeatureKey)) {
      monthlyUsage.set(monthlyFeatureKey, { month: monthKey, feature: event.l3_feature, sessions: new Set() });
    }
    monthlyUsage.get(monthlyFeatureKey).sessions.add(event.session_id);

    if (!monthlyTotals.has(monthKey)) monthlyTotals.set(monthKey, new Set());
    monthlyTotals.get(monthKey).add(event.session_id);
  }

  for (const session of sessions) {
    const startedAt = new Date(session.session_start || session.createdAt || Date.now());
    const weekKey = getIsoWeekKey(startedAt);
    if (!weekly.has(weekKey)) weekly.set(weekKey, { week: weekKey, sessions: 0, churned: 0 });
    const weeklyRow = weekly.get(weekKey);
    weeklyRow.sessions += 1;
    if (isSessionChurned(session, latestPredictions.get(session.session_id))) weeklyRow.churned += 1;
  }

  return {
    daily_usage: [...daily.values()]
      .map((row) => ({ date: row.date, event_count: row.event_count, session_count: row.sessions.size }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    weekly_churn: [...weekly.values()]
      .map((row) => ({ week: row.week, churn_rate: row.sessions ? round(row.churned / row.sessions) : 0 }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    monthly_adoption_trends: [...monthlyUsage.values()]
      .map((row) => ({
        month: row.month,
        feature: row.feature,
        adoption_percentage: monthlyTotals.get(row.month)?.size
          ? round((row.sessions.size / monthlyTotals.get(row.month).size) * 100, 2)
          : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.feature.localeCompare(b.feature)),
    peak_usage_hours: [...hours.entries()]
      .map(([hour, event_count]) => ({ hour, event_count }))
      .sort((a, b) => a.hour - b.hour),
  };
}

function computeBenchmarks({ featureUsage, journeys, events, sessions }) {
  const featureDurations = featureUsage.map((row) => row.avg_duration_ms).filter(Boolean);
  const journeyDurations = [
    ...journeys.most_common_paths.map((row) => row.avg_duration_ms),
    ...journeys.highest_churn_paths.map((row) => row.avg_duration_ms),
  ].filter(Boolean);

  const feedbackEvents = events.filter((event) => String(event.feedback_text || '').trim());
  const feedbackByFeature = new Map();
  for (const event of feedbackEvents) {
    const feature = event.l3_feature || 'Unknown Feature';
    if (!feedbackByFeature.has(feature)) feedbackByFeature.set(feature, []);
    feedbackByFeature.get(feature).push(String(event.feedback_text || '').toLowerCase());
  }

  const retryByFeature = new Map();
  for (const session of sessions) {
    const seen = new Map();
    for (const feature of session.feature_sequence || []) {
      seen.set(feature, (seen.get(feature) || 0) + 1);
    }
    for (const [feature, count] of seen.entries()) {
      if (!retryByFeature.has(feature)) retryByFeature.set(feature, { retried: 0, sessions: 0 });
      const row = retryByFeature.get(feature);
      row.sessions += 1;
      if (count > 1) row.retried += 1;
    }
  }

  const usageCounts = featureUsage.map((row) => row.usage_count).filter(Boolean);
  return {
    benchmark_feature_duration_ms: median(featureDurations),
    benchmark_path_duration_ms: median(journeyDurations),
    p75_usage_count: quantile(usageCounts, 0.75),
    feedback_by_feature: feedbackByFeature,
    retry_by_feature: retryByFeature,
  };
}

async function computeTenantComparison({ ownerId, feature, start, end, channel, deploymentType }) {
  const { listTenantsForOwner } = require('../../models/TenantModel');
  const tenants = await listTenantsForOwner(ownerId);
  const rows = [];

  for (const tenant of tenants) {
    const data = await loadAnalyticsData({
      tenantId: tenant.id,
      start,
      end,
      channel,
      deploymentType,
      feature: null,
    });
    const latestPredictions = getLatestPredictionMap(data.predictions);
    const kpis = computeKpis({ ...data, latestPredictions });
    const featureUsage = computeFeatureUsage({ ...data, groupBy: 'feature', sessions: data.sessions }).find(
      (item) => item.feature === feature
    );

    const normalizedSpeedScore = kpis.avg_session_duration_ms
      ? Math.max(0, 1 - (kpis.avg_session_duration_ms / Math.max(kpis.avg_session_duration_ms, 600000)))
      : 1;
    const successRate = data.events.length
      ? round(data.events.filter((item) => item.success !== false).length / data.events.length)
      : 0;

    rows.push({
      tenant_id: tenant.id,
      tenant_hash: tenant.tenant_hash,
      company_name: tenant.company_name,
      adoption_percentage: featureUsage?.adoption_percentage || 0,
      churn_rate: kpis.churn_rate,
      success_rate: successRate,
      avg_session_duration_ms: kpis.avg_session_duration_ms,
      tenant_score: round(
        ((featureUsage?.adoption_percentage || 0) * 0.35) +
          ((1 - kpis.churn_rate) * 100 * 0.35) +
          (successRate * 100 * 0.2) +
          (normalizedSpeedScore * 10),
        2
      ),
    });
  }

  const sorted = [...rows].sort((a, b) => b.tenant_score - a.tenant_score);
  return {
    feature,
    tenants: rows,
    best_performing_tenant: sorted[0]?.tenant_id || null,
    worst_performing_tenant: sorted[sorted.length - 1]?.tenant_id || null,
  };
}

async function getDashboardAnalytics(input) {
  const data = await loadAnalyticsData(input);
  const latestPredictions = getLatestPredictionMap(data.predictions);
  const kpis = computeKpis({ ...data, latestPredictions });
  const featureUsage = computeFeatureUsage({ ...data, groupBy: input.groupBy });
  const churn = computeChurnAnalytics({ ...data, latestPredictions });
  const funnel = computeFunnel({ sessions: data.sessions, steps: input.steps });
  const journeys = computeJourneys({ sessions: data.sessions, latestPredictions, limit: Number(input.limit || 10) });
  const timeInsights = computeTimeInsights({ events: data.events, sessions: data.sessions, latestPredictions });
  const benchmarks = computeBenchmarks({
    featureUsage: computeFeatureUsage({ ...data, groupBy: 'feature' }),
    journeys,
    events: data.events,
    sessions: data.sessions,
  });

  return {
    kpis,
    feature_usage: featureUsage,
    churn,
    funnel,
    journeys,
    time_insights: timeInsights,
    recommendations: data.recommendations,
    benchmarks,
    latest_predictions: latestPredictions,
    scoped_sessions: data.sessions,
    scoped_events: data.events,
  };
}

module.exports = {
  CHURN_THRESHOLD,
  DEFAULT_FUNNEL_STEPS,
  STRATEGIC_FEATURES,
  loadAnalyticsData,
  getLatestPredictionMap,
  isSessionChurned,
  computeKpis,
  computeFeatureUsage,
  computeChurnAnalytics,
  computeFunnel,
  computeJourneys,
  computeTimeInsights,
  computeBenchmarks,
  computeTenantComparison,
  getDashboardAnalytics,
  normalizeStepList,
  round,
  median,
  quantile,
};
