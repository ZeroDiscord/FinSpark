'use strict';

const { Recommendation } = require('../../database/models');
const {
  getDashboardAnalytics,
  STRATEGIC_FEATURES,
  round,
} = require('./dashboardAnalyticsService');

const REFRESH_WINDOW_MS = 10 * 60 * 1000;

function toPriority(score) {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function escapeKeyPart(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDedupeKey({ tenantId, category, feature, scope = 'global' }) {
  return [tenantId, category, feature, scope].map(escapeKeyPart).join(':');
}

function computeImpactScore({
  churnRate = 0,
  dropOffRate = 0,
  failureRate = 0,
  retryRate = 0,
  negativeFeedbackRate = 0,
  avgDurationMs = 0,
  benchmarkDurationMs = 1,
  adoptionPercentage = 100,
  targetAdoption = 70,
}) {
  const durationOverrunScore = benchmarkDurationMs ? Math.min(avgDurationMs / benchmarkDurationMs, 1) : 0;
  const adoptionGapScore = targetAdoption > 0 ? Math.max(0, Math.min((targetAdoption - adoptionPercentage) / targetAdoption, 1)) : 0;
  return Math.min(
    100,
    round(
      (churnRate * 35) +
        (dropOffRate * 20) +
        (failureRate * 15) +
        (retryRate * 10) +
        (negativeFeedbackRate * 10) +
        (durationOverrunScore * 5) +
        (adoptionGapScore * 5),
      0
    )
  );
}

function buildRecommendation({
  tenantId,
  feature,
  category,
  problem,
  suggestion,
  metrics,
  sourceData,
  refreshStart,
  refreshEnd,
  scope,
}) {
  const impactScore = computeImpactScore({
    churnRate: metrics.churn_rate,
    dropOffRate: metrics.drop_off_rate,
    failureRate: metrics.failure_rate,
    retryRate: metrics.retry_rate,
    negativeFeedbackRate: metrics.negative_feedback_rate,
    avgDurationMs: metrics.avg_duration_ms,
    benchmarkDurationMs: metrics.benchmark_duration_ms,
    adoptionPercentage: metrics.adoption_percentage,
    targetAdoption: metrics.target_adoption,
  });

  return {
    tenant_id: tenantId,
    title: `Improve ${feature}`,
    feature,
    problem,
    suggestion,
    priority: toPriority(impactScore),
    impact_score: impactScore,
    churn_score: round(metrics.churn_rate || metrics.drop_off_rate || 0, 4),
    category,
    metrics,
    status: 'open',
    refresh_window_start: refreshStart ? new Date(refreshStart) : null,
    refresh_window_end: refreshEnd ? new Date(refreshEnd) : null,
    dedupe_key: buildDedupeKey({ tenantId, category, feature, scope }),
    source_data: sourceData,
  };
}

function getFeatureMaps(analytics) {
  const featureUsage = analytics.feature_usage.filter((row) => row.feature);
  return new Map(featureUsage.map((row) => [row.feature, row]));
}

function getRetryRate(feature, retryByFeature) {
  const row = retryByFeature.get(feature);
  if (!row || !row.sessions) return 0;
  return round(row.retried / row.sessions);
}

function getFeedbackSignals(feature, feedbackByFeature, usageCount = 0) {
  const rows = feedbackByFeature.get(feature) || [];
  if (!rows.length) {
    return {
      negative_feedback_rate: 0,
      slow_rate: 0,
      error_rate: 0,
    };
  }

  const slowMatches = rows.filter((text) => /slow|stuck/.test(text)).length;
  const errorMatches = rows.filter((text) => /error|failed|retry/.test(text)).length;
  return {
    negative_feedback_rate: usageCount ? round(rows.length / usageCount) : 0,
    slow_rate: usageCount ? round(slowMatches / usageCount) : 0,
    error_rate: usageCount ? round(errorMatches / usageCount) : 0,
  };
}

function addRecommendation(recommendations, recommendation) {
  if (!recommendation) return;
  const existingIndex = recommendations.findIndex((item) => item.dedupe_key === recommendation.dedupe_key);
  if (existingIndex === -1) {
    recommendations.push(recommendation);
    return;
  }
  if (recommendation.impact_score > recommendations[existingIndex].impact_score) {
    recommendations[existingIndex] = recommendation;
  }
}

function persistableRecommendation(row) {
  return {
    title: row.title,
    problem: row.problem,
    suggestion: row.suggestion,
    priority: row.priority,
    impact_score: row.impact_score,
    churn_score: row.churn_score,
    category: row.category,
    metrics: row.metrics,
    status: row.status,
    refresh_window_start: row.refresh_window_start,
    refresh_window_end: row.refresh_window_end,
    dedupe_key: row.dedupe_key,
    source_data: row.source_data,
    tenant_id: row.tenant_id,
  };
}

function buildAnalyticsRecommendations({ tenantId, analytics, filters }) {
  const recommendations = [];
  const refreshStart = filters.start || null;
  const refreshEnd = filters.end || null;
  const featureUsageMap = getFeatureMaps(analytics);
  const benchmarkFeatureDuration = analytics.benchmarks.benchmark_feature_duration_ms || 1;
  const benchmarkPathDuration = analytics.benchmarks.benchmark_path_duration_ms || 1;
  const retryByFeature = analytics.benchmarks.retry_by_feature;
  const feedbackByFeature = analytics.benchmarks.feedback_by_feature;
  const portfolioTenantAverage = analytics.churn.churn_by_tenant.length
    ? analytics.churn.churn_by_tenant.reduce((sum, row) => sum + row.churn_rate, 0) / analytics.churn.churn_by_tenant.length
    : 0;
  const globalChannelAverage = analytics.churn.churn_by_channel.length
    ? analytics.churn.churn_by_channel.reduce((sum, row) => sum + row.churn_rate, 0) / analytics.churn.churn_by_channel.length
    : 0;
  const churnedJourneyCount = analytics.journeys.highest_churn_paths.reduce((sum, row) => sum + row.session_count, 0) || 1;
  const channelMap = new Map(analytics.churn.churn_by_channel.map((row) => [row.channel, row]));

  for (const row of analytics.churn.churn_by_feature) {
    if (row.churn_rate < 0.6) continue;
    const usage = featureUsageMap.get(row.feature) || {};
    const feedback = getFeedbackSignals(row.feature, feedbackByFeature, usage.usage_count || 0);
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: row.feature,
        category: 'high_churn',
        problem: `${Math.round(row.churn_rate * 100)}% of sessions touching ${row.feature} are predicted to churn.`,
        suggestion: `Simplify ${row.feature}, defer it in the journey, or add contextual guidance before this step.`,
        metrics: {
          churn_rate: row.churn_rate,
          drop_off_rate: row.churn_rate,
          failure_rate: usage.failure_rate || 0,
          retry_rate: getRetryRate(row.feature, retryByFeature),
          negative_feedback_rate: feedback.negative_feedback_rate,
          avg_duration_ms: usage.avg_duration_ms || 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: usage.adoption_percentage || 0,
          target_adoption: 70,
          usage_count: usage.usage_count || 0,
        },
        sourceData: { rule_id: 'feature_churn_rate', feature: row.feature, threshold: 0.6 },
        refreshStart,
        refreshEnd,
      })
    );
  }

  for (const row of analytics.churn.churn_by_module) {
    if (row.churn_rate < 0.5) continue;
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: row.module,
        category: 'module_churn',
        problem: `${Math.round(row.churn_rate * 100)}% of sessions in ${row.module} end with churn risk.`,
        suggestion: `Audit the ${row.module} flow, remove redundant fields, and tighten transition logic between steps.`,
        metrics: {
          churn_rate: row.churn_rate,
          drop_off_rate: row.churn_rate,
          failure_rate: 0.05,
          retry_rate: 0.05,
          negative_feedback_rate: 0,
          avg_duration_ms: 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: 100,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'module_churn_rate', module: row.module, threshold: 0.5 },
        refreshStart,
        refreshEnd,
      })
    );
  }

  for (const row of analytics.churn.churn_by_tenant) {
    if ((row.churn_rate - portfolioTenantAverage) < 0.15) continue;
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: row.tenant_id,
        category: 'tenant_gap',
        problem: `Tenant churn is ${Math.round((row.churn_rate - portfolioTenantAverage) * 100)} points above the portfolio average.`,
        suggestion: 'Review this tenant configuration, onboarding, and deployment-specific journey friction.',
        metrics: {
          churn_rate: row.churn_rate,
          drop_off_rate: row.churn_rate,
          failure_rate: 0.05,
          retry_rate: 0.05,
          negative_feedback_rate: 0,
          avg_duration_ms: 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: 100,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'tenant_churn_gap', tenant_id: row.tenant_id, portfolio_average: round(portfolioTenantAverage, 4) },
        refreshStart,
        refreshEnd,
        scope: row.tenant_id,
      })
    );
  }

  for (const row of analytics.churn.churn_by_channel) {
    if ((row.churn_rate - globalChannelAverage) < 0.1) continue;
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: row.channel,
        category: 'channel_gap',
        problem: `${row.channel} churn is ${Math.round((row.churn_rate - globalChannelAverage) * 100)} points worse than the channel average.`,
        suggestion: `Review ${row.channel} specific UX, rendering, and assisted-flow dependencies.`,
        metrics: {
          churn_rate: row.churn_rate,
          drop_off_rate: row.churn_rate,
          failure_rate: 0.05,
          retry_rate: 0.05,
          negative_feedback_rate: 0,
          avg_duration_ms: 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: 100,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'channel_churn_gap', channel: row.channel, channel_average: round(globalChannelAverage, 4) },
        refreshStart,
        refreshEnd,
        scope: row.channel,
      })
    );
  }

  const churnedDropOffTotal = analytics.churn.top_drop_off_features.reduce((sum, row) => sum + row.drop_off_count, 0) || 1;
  for (const row of analytics.churn.top_drop_off_features) {
    const dropShare = row.drop_off_count / churnedDropOffTotal;
    if (dropShare < 0.2) continue;
    const usage = featureUsageMap.get(row.feature) || {};
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: row.feature,
        category: 'drop_off',
        problem: `${Math.round(dropShare * 100)}% of churned sessions drop at ${row.feature}.`,
        suggestion: `Re-sequence ${row.feature}, reduce external dependencies, and add progress cues before this step.`,
        metrics: {
          churn_rate: row.churn_rate,
          drop_off_rate: dropShare,
          failure_rate: usage.failure_rate || 0,
          retry_rate: getRetryRate(row.feature, retryByFeature),
          negative_feedback_rate: usage.negative_feedback_rate || 0,
          avg_duration_ms: usage.avg_duration_ms || 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: usage.adoption_percentage || 0,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'drop_off_feature_share', feature: row.feature, drop_share: round(dropShare, 4) },
        refreshStart,
        refreshEnd,
      })
    );
  }

  for (const step of analytics.funnel.steps) {
    if (step.drop_off_percentage < 30) continue;
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: step.step,
        category: 'funnel_drop_off',
        problem: `${round(step.drop_off_percentage, 0)}% of users drop before completing ${step.step}.`,
        suggestion: `Reduce the number of decisions in ${step.step} and instrument targeted helper content before this stage.`,
        metrics: {
          churn_rate: step.drop_off_percentage / 100,
          drop_off_rate: step.drop_off_percentage / 100,
          failure_rate: 0.05,
          retry_rate: 0.05,
          negative_feedback_rate: 0,
          avg_duration_ms: 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: step.conversion_percentage,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'funnel_step_drop_off', step: step.step, drop_off_percentage: step.drop_off_percentage },
        refreshStart,
        refreshEnd,
      })
    );
  }

  for (const usage of analytics.feature_usage.filter((row) => row.feature)) {
    const retryRate = getRetryRate(usage.feature, retryByFeature);
    const feedback = getFeedbackSignals(usage.feature, feedbackByFeature, usage.usage_count || 0);
    const usageCount = usage.usage_count || 0;

    if (usage.avg_duration_ms >= benchmarkFeatureDuration * 1.5) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'long_duration',
          problem: `${usage.feature} takes ${Math.round(usage.avg_duration_ms / 1000)} seconds on average, well above peer median.`,
          suggestion: `Shorten ${usage.feature}, prefill known fields, and split heavy validation into async follow-up steps.`,
          metrics: {
            churn_rate: 0.35,
            drop_off_rate: 0.2,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate || 0,
            avg_duration_ms: usage.avg_duration_ms,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'feature_duration_outlier', feature: usage.feature, benchmark_duration_ms: benchmarkFeatureDuration },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (usage.failure_rate >= 0.1) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'frequent_failures',
          problem: `${Math.round(usage.failure_rate * 100)}% of ${usage.feature} events fail.`,
          suggestion: `Improve validation, recovery messaging, retries, and service dependency handling for ${usage.feature}.`,
          metrics: {
            churn_rate: 0.4,
            drop_off_rate: 0.2,
            failure_rate: usage.failure_rate,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate || 0,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'failure_rate', feature: usage.feature, threshold: 0.1 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (retryRate >= 0.2) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'high_retry',
          problem: `${Math.round(retryRate * 100)}% of sessions repeat ${usage.feature}.`,
          suggestion: `Add autosave, inline help, and clearer completion cues for ${usage.feature}.`,
          metrics: {
            churn_rate: 0.3,
            drop_off_rate: 0.2,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate || 0,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'retry_rate', feature: usage.feature, threshold: 0.2 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (STRATEGIC_FEATURES.has(usage.feature) && usage.adoption_percentage < 25) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'low_adoption',
          problem: `${usage.feature} adoption is only ${round(usage.adoption_percentage, 0)}%.`,
          suggestion: `Surface ${usage.feature} earlier, add stronger calls to action, and simplify discovery.`,
          metrics: {
            churn_rate: 0.2,
            drop_off_rate: 0.1,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate || 0,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'strategic_low_adoption', feature: usage.feature, threshold: 25 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (usage.negative_feedback_rate >= 0.05) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'negative_feedback',
          problem: `${Math.round(usage.negative_feedback_rate * 100)}% of ${usage.feature} interactions include user feedback.`,
          suggestion: `Review verbatim feedback for ${usage.feature}, tighten UX copy, and remove ambiguous states.`,
          metrics: {
            churn_rate: 0.25,
            drop_off_rate: 0.15,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'negative_feedback_rate', feature: usage.feature, threshold: 0.05 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (feedback.slow_rate >= 0.03) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'slow_feedback',
          problem: `Users mention slow or stuck behavior in ${Math.round(feedback.slow_rate * 100)}% of ${usage.feature} feedback.`,
          suggestion: `Improve perceived performance in ${usage.feature} with progress states, async loading, and timeout recovery.`,
          metrics: {
            churn_rate: 0.3,
            drop_off_rate: 0.2,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: feedback.slow_rate,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'slow_feedback_keywords', feature: usage.feature, threshold: 0.03 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (feedback.error_rate >= 0.03) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'error_feedback',
          problem: `Users report errors or retries in ${Math.round(feedback.error_rate * 100)}% of ${usage.feature} feedback.`,
          suggestion: `Strengthen error handling for ${usage.feature} and make retry and recovery states explicit.`,
          metrics: {
            churn_rate: 0.35,
            drop_off_rate: 0.2,
            failure_rate: usage.failure_rate || 0,
            retry_rate: retryRate,
            negative_feedback_rate: feedback.error_rate,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: { rule_id: 'error_feedback_keywords', feature: usage.feature, threshold: 0.03 },
          refreshStart,
          refreshEnd,
        })
      );
    }

    if (usage.usage_count >= analytics.benchmarks.p75_usage_count && usage.success_rate < 0.85) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: usage.feature,
          category: 'high_volume_low_success',
          problem: `${usage.feature} is heavily used but succeeds only ${Math.round(usage.success_rate * 100)}% of the time.`,
          suggestion: `Prioritize reliability work on ${usage.feature}; it affects a large share of traffic.`,
          metrics: {
            churn_rate: 0.35,
            drop_off_rate: 0.2,
            failure_rate: 1 - usage.success_rate,
            retry_rate: retryRate,
            negative_feedback_rate: usage.negative_feedback_rate || 0,
            avg_duration_ms: usage.avg_duration_ms || 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: usage.adoption_percentage || 0,
            target_adoption: 70,
            usage_count: usageCount,
          },
          sourceData: {
            rule_id: 'high_volume_low_success',
            feature: usage.feature,
            p75_usage_count: analytics.benchmarks.p75_usage_count,
          },
          refreshStart,
          refreshEnd,
        })
      );
    }
  }

  const mostCommonBySignature = new Map();
  for (const path of analytics.journeys.most_common_paths) {
    mostCommonBySignature.set(path.path.join(' -> '), path);
  }

  for (const path of analytics.journeys.highest_churn_paths) {
    if (path.avg_duration_ms >= benchmarkPathDuration * 1.4 && path.avg_churn_probability >= 0.5) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: path.drop_off_feature || path.path[path.path.length - 1] || 'Journey',
          category: 'journey_duration',
          problem: `Journey ${path.path.join(' -> ')} is long-running and averages ${Math.round(path.avg_churn_probability * 100)}% churn risk.`,
          suggestion: 'Break this journey into fewer steps, reorder heavy verification later, and remove duplicate actions.',
          metrics: {
            churn_rate: path.avg_churn_probability,
            drop_off_rate: path.high_churn_rate,
            failure_rate: 0.05,
            retry_rate: 0.1,
            negative_feedback_rate: 0,
            avg_duration_ms: path.avg_duration_ms,
            benchmark_duration_ms: benchmarkPathDuration,
            adoption_percentage: 100,
            target_adoption: 70,
          },
          sourceData: { rule_id: 'path_duration_churn', path: path.path },
          refreshStart,
          refreshEnd,
          scope: path.path.join('>'),
        })
      );
    }

    const dropShare = path.session_count / churnedJourneyCount;
    if (dropShare >= 0.25) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: path.drop_off_feature || path.path[path.path.length - 1] || 'Journey',
          category: 'high_value_path_dropoff',
          problem: `${Math.round(dropShare * 100)}% of high-risk journeys end at ${path.drop_off_feature || 'the final step'}.`,
          suggestion: `Protect this high-value path with progressive disclosure, save-and-resume, and pre-validation.`,
          metrics: {
            churn_rate: path.avg_churn_probability,
            drop_off_rate: dropShare,
            failure_rate: 0.05,
            retry_rate: 0.1,
            negative_feedback_rate: 0,
            avg_duration_ms: path.avg_duration_ms,
            benchmark_duration_ms: benchmarkPathDuration,
            adoption_percentage: 100,
            target_adoption: 70,
          },
          sourceData: { rule_id: 'high_value_path_dropoff', path: path.path, drop_share: round(dropShare, 4) },
          refreshStart,
          refreshEnd,
          scope: path.path.join('>'),
        })
      );
    }
  }

  const monthlyByFeature = new Map();
  for (const row of analytics.time_insights.monthly_adoption_trends) {
    if (!monthlyByFeature.has(row.feature)) monthlyByFeature.set(row.feature, []);
    monthlyByFeature.get(row.feature).push(row);
  }

  for (const [feature, rows] of monthlyByFeature.entries()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
    const current = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (!previous.adoption_percentage) continue;
    const decline = (previous.adoption_percentage - current.adoption_percentage) / previous.adoption_percentage;
    if (decline < 0.15) continue;
    const usage = featureUsageMap.get(feature) || {};
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature,
        category: 'adoption_decline',
        problem: `${feature} adoption declined ${Math.round(decline * 100)}% month over month.`,
        suggestion: `Investigate release changes, discoverability, and tenant rollout configuration for ${feature}.`,
        metrics: {
          churn_rate: 0.25,
          drop_off_rate: 0.1,
          failure_rate: usage.failure_rate || 0,
          retry_rate: getRetryRate(feature, retryByFeature),
          negative_feedback_rate: usage.negative_feedback_rate || 0,
          avg_duration_ms: usage.avg_duration_ms || 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: current.adoption_percentage,
          target_adoption: previous.adoption_percentage,
        },
        sourceData: { rule_id: 'adoption_decline_mom', feature, decline: round(decline, 4) },
        refreshStart,
        refreshEnd,
      })
    );
  }

  const androidChurn = channelMap.get('android')?.churn_rate || 0;
  const webChurn = channelMap.get('web')?.churn_rate || 0;
  if ((androidChurn - webChurn) >= 0.12) {
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: 'android',
        category: 'channel_churn_gap',
        problem: `Android churn is ${Math.round((androidChurn - webChurn) * 100)} points higher than web.`,
        suggestion: 'Review Android-specific form friction, network handling, and session recovery behavior.',
        metrics: {
          churn_rate: androidChurn,
          drop_off_rate: androidChurn - webChurn,
          failure_rate: 0.05,
          retry_rate: 0.05,
          negative_feedback_rate: 0,
          avg_duration_ms: 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: 100,
          target_adoption: 70,
        },
        sourceData: { rule_id: 'android_vs_web_churn_gap', android_churn: androidChurn, web_churn: webChurn },
        refreshStart,
        refreshEnd,
      })
    );
  }

  for (const usage of analytics.feature_usage.filter((row) => row.feature)) {
    const cloudUsage = usage.usage_by_deployment_type.find((row) => row.deployment_type === 'cloud')?.usage_count || 0;
    const onPremUsage = usage.usage_by_deployment_type.find((row) => row.deployment_type === 'onprem')?.usage_count || 0;
    const total = cloudUsage + onPremUsage;
    if (!total) continue;
    const cloudAdoption = (cloudUsage / total) * 100;
    const onPremAdoption = (onPremUsage / total) * 100;
    if (Math.abs(cloudAdoption - onPremAdoption) < 20) continue;
    addRecommendation(
      recommendations,
      buildRecommendation({
        tenantId,
        feature: usage.feature,
        category: 'deployment_gap',
        problem: `${usage.feature} adoption differs by ${Math.round(Math.abs(cloudAdoption - onPremAdoption))} points between cloud and on-prem.`,
        suggestion: 'Audit deployment-specific configuration and infrastructure dependencies for this feature.',
        metrics: {
          churn_rate: 0.25,
          drop_off_rate: Math.abs(cloudAdoption - onPremAdoption) / 100,
          failure_rate: usage.failure_rate || 0,
          retry_rate: getRetryRate(usage.feature, retryByFeature),
          negative_feedback_rate: usage.negative_feedback_rate || 0,
          avg_duration_ms: usage.avg_duration_ms || 0,
          benchmark_duration_ms: benchmarkFeatureDuration,
          adoption_percentage: Math.min(cloudAdoption, onPremAdoption),
          target_adoption: Math.max(cloudAdoption, onPremAdoption),
        },
        sourceData: {
          rule_id: 'cloud_vs_onprem_adoption_gap',
          feature: usage.feature,
          cloud_adoption: round(cloudAdoption, 2),
          onprem_adoption: round(onPremAdoption, 2),
        },
        refreshStart,
        refreshEnd,
      })
    );
  }

  const topHours = [...analytics.time_insights.peak_usage_hours]
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, 3)
    .map((row) => row.hour);

  if (topHours.length) {
    const eventHours = new Map();
    for (const event of analytics.scoped_events) {
      const hour = new Date(event.timestamp).getUTCHours();
      if (!eventHours.has(hour)) eventHours.set(hour, { events: 0, failures: 0 });
      const row = eventHours.get(hour);
      row.events += 1;
      if (event.success === false) row.failures += 1;
    }

    const peakFailures = topHours.reduce((sum, hour) => sum + (eventHours.get(hour)?.failures || 0), 0);
    const peakEvents = topHours.reduce((sum, hour) => sum + (eventHours.get(hour)?.events || 0), 0);
    const offPeakHours = [...eventHours.keys()].filter((hour) => !topHours.includes(hour));
    const offPeakFailures = offPeakHours.reduce((sum, hour) => sum + (eventHours.get(hour)?.failures || 0), 0);
    const offPeakEvents = offPeakHours.reduce((sum, hour) => sum + (eventHours.get(hour)?.events || 0), 0);
    const peakFailureRate = peakEvents ? peakFailures / peakEvents : 0;
    const offPeakFailureRate = offPeakEvents ? offPeakFailures / offPeakEvents : 0;

    if ((peakFailureRate - offPeakFailureRate) >= 0.1) {
      addRecommendation(
        recommendations,
        buildRecommendation({
          tenantId,
          feature: 'Peak Hours',
          category: 'peak_hour_degradation',
          problem: `Failure rate during peak hours is ${Math.round((peakFailureRate - offPeakFailureRate) * 100)} points worse than off-peak.`,
          suggestion: 'Scale peak-hour dependencies and review queueing, timeout, and service fallback behavior.',
          metrics: {
            churn_rate: 0.3,
            drop_off_rate: peakFailureRate - offPeakFailureRate,
            failure_rate: peakFailureRate,
            retry_rate: 0.05,
            negative_feedback_rate: 0,
            avg_duration_ms: 0,
            benchmark_duration_ms: benchmarkFeatureDuration,
            adoption_percentage: 100,
            target_adoption: 70,
          },
          sourceData: {
            rule_id: 'peak_hour_degradation',
            peak_failure_rate: round(peakFailureRate, 4),
            offpeak_failure_rate: round(offPeakFailureRate, 4),
          },
          refreshStart,
          refreshEnd,
        })
      );
    }
  }

  return recommendations
    .map(persistableRecommendation)
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, 50);
}

async function persistRecommendations(tenantId, recommendations) {
  const saved = [];
  for (const recommendation of recommendations) {
    const doc = await Recommendation.findOneAndUpdate(
      { tenant_id: tenantId, dedupe_key: recommendation.dedupe_key },
      {
        $set: {
          title: recommendation.title,
          problem: recommendation.problem,
          suggestion: recommendation.suggestion,
          priority: recommendation.priority,
          impact_score: recommendation.impact_score,
          churn_score: recommendation.churn_score,
          category: recommendation.category,
          metrics: recommendation.metrics,
          source_data: recommendation.source_data,
          refresh_window_start: recommendation.refresh_window_start,
          refresh_window_end: recommendation.refresh_window_end,
          status: 'open',
        },
        $setOnInsert: {
          tenant_id: recommendation.tenant_id,
          dedupe_key: recommendation.dedupe_key,
        },
      },
      { upsert: true, new: true }
    ).lean();
    saved.push(doc);
  }
  return saved;
}

async function generateAndStoreRecommendationCards(tenantId, filters = {}) {
  const analytics = await getDashboardAnalytics({ tenantId, ...filters });
  const recommendations = buildAnalyticsRecommendations({ tenantId, analytics, filters });
  return persistRecommendations(tenantId, recommendations);
}

async function getRecommendationCards(tenantId, filters = {}) {
  const query = { tenant_id: tenantId };
  query.status = filters.status || { $in: ['open', 'sent'] };
  if (filters.priority) query.priority = filters.priority;
  if (filters.category) query.category = filters.category;

  const existing = await Recommendation.find(query).sort({ impact_score: -1, created_at: -1 }).lean();
  const shouldRefresh =
    filters.refresh === 'true' ||
    !existing.length ||
    existing.every((row) => Date.now() - new Date(row.updated_at || row.created_at).getTime() > REFRESH_WINDOW_MS);

  const rows = shouldRefresh ? await generateAndStoreRecommendationCards(tenantId, filters) : existing;
  return rows.map((row) => ({
    id: String(row._id),
    tenant_id: row.tenant_id,
    feature: row.source_data?.feature || row.feature || row.title,
    problem: row.problem,
    suggestion: row.suggestion,
    priority: row.priority,
    impact_score: row.impact_score || 0,
    category: row.category || row.source_data?.rule_id || 'analytics',
    metrics: row.metrics || {},
    status: row.status,
    created_at: row.created_at,
    churn_score: row.churn_score || row.metrics?.churn_rate || 0,
  }));
}

async function dismissRecommendation(tenantId, recommendationId) {
  const updated = await Recommendation.findOneAndUpdate(
    { _id: recommendationId, tenant_id: tenantId },
    { $set: { status: 'dismissed' } },
    { new: true }
  ).lean();
  return Boolean(updated);
}

module.exports = {
  computeImpactScore,
  toPriority,
  buildAnalyticsRecommendations,
  generateAndStoreRecommendationCards,
  getRecommendationCards,
  dismissRecommendation,
};
