import client from './client.js'

// All routes use path-based /dashboard/:tenantId/* (not query-param style)

export const getOverview = (tenantId) =>
  client.get(`/dashboard/${tenantId}/overview`).then((r) => r.data)

export const getFunnelEdges = (tenantId) =>
  client.get(`/dashboard/${tenantId}/funnel`).then((r) => r.data)

export const getChurnDistribution = (tenantId) =>
  client.get(`/dashboard/${tenantId}/churn-distribution`).then((r) => r.data)

export const getFriction = (tenantId) =>
  client.get(`/dashboard/${tenantId}/friction`).then((r) => r.data)

export const getFeatureUsage = (tenantId) =>
  client.get(`/dashboard/${tenantId}/feature-usage`).then((r) => r.data)

export const getSessions = (tenantId, limit = 8) =>
  client.get(`/dashboard/${tenantId}/sessions`, { params: { limit } }).then((r) => r.data)

export const getTransitionMatrix = (tenantId) =>
  client.get(`/dashboard/${tenantId}/transition-matrix`).then((r) => r.data)

export const getSegmentation = (tenantId) =>
  client.get(`/dashboard/${tenantId}/segmentation`).then((r) => r.data)

export const getInsight = (tenantId, question) =>
  client.get(`/dashboard/${tenantId}/insight`, { params: { question } }).then((r) => r.data)
