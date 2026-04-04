import {
  getChurnDistribution,
  getDashFriction,
  getFeatureUsage,
  getFunnel,
  getHeatmap,
  getInsight,
  getOverview,
} from '../api/dashboard.api.js'

export async function fetchDashboardOverview(tenantId) {
  return getOverview(tenantId)
}

export async function fetchFeatureUsage(tenantId) {
  return getFeatureUsage(tenantId)
}

export async function fetchTrendSeries(tenantId) {
  return getChurnDistribution(tenantId)
}

export async function fetchChurnHeatmap(tenantId) {
  return getHeatmap(tenantId).catch(() => [])
}

export async function fetchFunnel(tenantId) {
  return getFunnel(tenantId)
}

export async function fetchDropoffTable(tenantId) {
  return getDashFriction(tenantId)
}

export async function fetchDashboardInsight(tenantId, question) {
  return getInsight(tenantId, question)
}
