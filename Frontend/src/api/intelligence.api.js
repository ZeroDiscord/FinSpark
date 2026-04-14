import client from './client.js'

export const getKpis = (tenantId) =>
  client.get('/dashboard/kpis', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getTimeInsights = (tenantId) =>
  client.get('/dashboard/time-insights', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getOverview = (tenantId) =>
  client.get(`/dashboard/${tenantId}/overview`).then((r) => r.data)

export const getFunnelEdges = (tenantId) =>
  client.get('/dashboard/journey-graph', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getFunnelSummary = (tenantId) =>
  client.get('/dashboard/funnel', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getChurnDistribution = (tenantId) =>
  client.get(`/dashboard/${tenantId}/churn-distribution`).then((r) => r.data)

export const getFriction = (tenantId) =>
  client.get(`/dashboard/${tenantId}/friction`).then((r) => r.data)

export const getFeatureUsage = (tenantId) =>
  client.get(`/dashboard/${tenantId}/feature-usage`).then((r) => r.data)

export const getSessions = (tenantId, limit) =>
  client.get(`/dashboard/${tenantId}/sessions`, { params: limit ? { limit } : {} }).then((r) => r.data)


export const getSegmentation = (tenantId) =>
  client.get(`/dashboard/${tenantId}/segmentation`).then((r) => r.data)

export const getInsight = (tenantId, question) =>
  client.get(`/dashboard/${tenantId}/insight`, { params: { question } }).then((r) => r.data)
