import client from './client.js'

function withTenant(tenantId, params = {}) {
  return {
    ...params,
    tenant_id: tenantId,
  }
}

export const getKpis = (tenantId, params) =>
  client.get('/dashboard/kpis', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getFeatureUsage = (tenantId, params) =>
  client.get('/dashboard/feature-usage', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getChurn = (tenantId, params) =>
  client.get('/dashboard/churn', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getFunnel = (tenantId, params) =>
  client.get('/dashboard/funnel', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getJourneys = (tenantId, params) =>
  client.get('/dashboard/journeys', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getTimeInsights = (tenantId, params) =>
  client.get('/dashboard/time-insights', { params: withTenant(tenantId, params) }).then((r) => r.data)

export const getTenantComparison = (params) =>
  client.get('/dashboard/tenant-comparison', { params }).then((r) => r.data)
