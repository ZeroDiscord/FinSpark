import {
  getChurn,
  getFeatureUsage,
  getFunnel,
  getJourneys,
  getKpis,
  getTenantComparison,
  getTimeInsights,
} from '../api/dashboard.api.js'

const DEFAULT_FUNNEL_STEPS = ['Apply Loan', 'Upload Documents', 'Credit Check', 'Approval']

function normalizeFilters(filters = {}) {
  const params = {}
  const now = new Date()

  if (filters.start) params.start = filters.start
  if (filters.end) params.end = filters.end
  if (filters.dateRange && !params.start && !params.end) {
    const days = Number.parseInt(String(filters.dateRange).replace(/\D/g, ''), 10)
    if (!Number.isNaN(days) && days > 0) {
      const start = new Date(now)
      start.setDate(now.getDate() - days)
      params.start = start.toISOString()
      params.end = now.toISOString()
    }
  }
  if (filters.channel && filters.channel !== 'all') params.channel = filters.channel
  if (filters.deploymentType && filters.deploymentType !== 'all') params.deployment_type = filters.deploymentType
  if (filters.feature) params.feature = filters.feature
  if (filters.groupBy) params.group_by = filters.groupBy
  if (filters.limit) params.limit = filters.limit

  const steps = filters.steps || DEFAULT_FUNNEL_STEPS
  if (steps?.length) params.steps = Array.isArray(steps) ? steps.join(',') : steps

  return params
}

export async function fetchDashboardOverview(tenantId, filters) {
  return getKpis(tenantId, normalizeFilters(filters))
}

export async function fetchFeatureUsage(tenantId, filters) {
  const response = await getFeatureUsage(tenantId, normalizeFilters(filters))
  return response.rows || []
}

export async function fetchTrendSeries(tenantId, filters) {
  return getTimeInsights(tenantId, normalizeFilters(filters))
}

export async function fetchChurnHeatmap(tenantId, filters) {
  return getChurn(tenantId, normalizeFilters(filters))
}

export async function fetchFunnel(tenantId, filters) {
  return getFunnel(tenantId, normalizeFilters(filters))
}

export async function fetchDropoffTable(tenantId, filters) {
  const response = await getChurn(tenantId, normalizeFilters(filters))
  return response.top_drop_off_features || []
}

export async function fetchJourneys(tenantId, filters) {
  return getJourneys(tenantId, normalizeFilters(filters))
}

export async function fetchTenantComparison(feature, filters) {
  return getTenantComparison({
    ...normalizeFilters(filters),
    feature,
  })
}
