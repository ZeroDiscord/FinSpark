'use strict';

const axios = require('axios');
const { stringify } = require('csv-stringify/sync');
const config = require('../../config');
const { ExportHistory } = require('../database/models');
const { getDashboardAnalytics } = require('./analytics/dashboardAnalyticsService');
const { getRecommendationCards } = require('./analytics/recommendationEngineService');
const { AppError } = require('../utils/errors');

function buildFilters(input = {}) {
  return {
    tenantId: input.tenantId,
    start: input.start,
    end: input.end,
    channel: input.channel,
    deploymentType: input.deploymentType,
    steps: input.steps,
    limit: input.limit,
  };
}

async function buildPowerBiPayload(tenantId, filters = {}) {
  const analytics = await getDashboardAnalytics(buildFilters({ tenantId, ...filters }));
  const recommendations = await getRecommendationCards(tenantId, filters);

  return {
    tenant_id: tenantId,
    generated_at: new Date().toISOString(),
    filters: {
      start: filters.start || null,
      end: filters.end || null,
      channel: filters.channel || null,
      deployment_type: filters.deploymentType || null,
    },
    kpis: analytics.kpis,
    feature_usage: analytics.feature_usage,
    churn: analytics.churn,
    funnel: analytics.funnel,
    journeys: analytics.journeys,
    time_insights: analytics.time_insights,
    recommendations,
  };
}

function buildPowerBiCsvRows(payload) {
  const rows = [];

  rows.push({
    record_type: 'kpi_summary',
    tenant_id: payload.tenant_id,
    metric_name: 'total_sessions',
    metric_value: payload.kpis.total_sessions,
    feature_name: '',
    usage_count: '',
    churn_rate: '',
    recommendation: '',
    priority: '',
  });

  for (const item of payload.feature_usage) {
    rows.push({
      record_type: 'feature_usage',
      tenant_id: payload.tenant_id,
      metric_name: 'feature_usage',
      metric_value: item.adoption_percentage,
      feature_name: item.feature,
      usage_count: item.usage_count,
      churn_rate: '',
      recommendation: '',
      priority: '',
    });
  }

  for (const item of payload.churn.churn_by_feature) {
    rows.push({
      record_type: 'feature_churn',
      tenant_id: payload.tenant_id,
      metric_name: 'feature_churn_rate',
      metric_value: item.churn_rate,
      feature_name: item.feature,
      usage_count: item.session_count,
      churn_rate: item.churn_rate,
      recommendation: '',
      priority: '',
    });
  }

  for (const item of payload.recommendations) {
    rows.push({
      record_type: 'recommendation',
      tenant_id: payload.tenant_id,
      metric_name: 'impact_score',
      metric_value: item.impact_score,
      feature_name: item.feature,
      usage_count: item.metrics?.usage_count || '',
      churn_rate: item.metrics?.churn_rate || '',
      recommendation: item.suggestion,
      priority: item.priority,
    });
  }

  return rows;
}

function buildPowerBiCsv(payload) {
  return stringify(buildPowerBiCsvRows(payload), { header: true });
}

async function recordExportHistory({ tenantId, requestedBy, exportType, filters, status = 'ready' }) {
  return ExportHistory.create({
    tenant_id: tenantId,
    requested_by: requestedBy,
    export_type: exportType,
    status,
    filters,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

async function getPowerBiAccessToken() {
  if (!config.powerbi.tenantId || !config.powerbi.clientId || !config.powerbi.clientSecret) {
    throw new AppError('Power BI credentials are not configured.', 500, 'POWERBI_NOT_CONFIGURED');
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.powerbi.tenantId}/oauth2/v2.0/token`;
  const response = await axios.post(
    tokenUrl,
    new URLSearchParams({
      client_id: config.powerbi.clientId,
      client_secret: config.powerbi.clientSecret,
      scope: 'https://analysis.windows.net/powerbi/api/.default',
      grant_type: 'client_credentials',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

function buildPowerBiRows(payload) {
  const rows = [];
  for (const feature of payload.feature_usage.slice(0, 200)) {
    rows.push({
      tenant_id: payload.tenant_id,
      generated_at: payload.generated_at,
      record_type: 'feature_usage',
      feature_name: feature.feature,
      usage_count: feature.usage_count,
      adoption_percentage: feature.adoption_percentage,
      churn_rate: '',
      impact_score: '',
      recommendation: '',
      priority: '',
    });
  }
  for (const recommendation of payload.recommendations.slice(0, 200)) {
    rows.push({
      tenant_id: payload.tenant_id,
      generated_at: payload.generated_at,
      record_type: 'recommendation',
      feature_name: recommendation.feature,
      usage_count: recommendation.metrics?.usage_count || 0,
      adoption_percentage: recommendation.metrics?.adoption_percentage || 0,
      churn_rate: recommendation.metrics?.churn_rate || 0,
      impact_score: recommendation.impact_score,
      recommendation: recommendation.suggestion,
      priority: recommendation.priority,
    });
  }
  return rows;
}

async function pushToPowerBi(payload) {
  const workspaceId = config.powerbi.workspaceId;
  const datasetId = config.powerbi.datasetId;
  const tableName = config.powerbi.tableName;
  if (!workspaceId || !datasetId) {
    throw new AppError('Power BI workspace or dataset is not configured.', 500, 'POWERBI_DATASET_NOT_CONFIGURED');
  }

  const accessToken = await getPowerBiAccessToken();
  const rows = buildPowerBiRows(payload);
  await axios.post(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/tables/${tableName}/rows`,
    { rows },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  await axios.post(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/refreshes`,
    { notifyOption: 'NoNotification' },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    workspace_id: workspaceId,
    dataset_id: datasetId,
    table_name: tableName,
    pushed_rows: rows.length,
    refreshed: true,
  };
}

module.exports = {
  buildPowerBiPayload,
  buildPowerBiCsv,
  buildPowerBiCsvRows,
  recordExportHistory,
  pushToPowerBi,
};
