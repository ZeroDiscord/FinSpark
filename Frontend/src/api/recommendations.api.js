import client from './client.js'

export const getRecommendations = (tenantId, params = {}) =>
  client.get('/recommendations', { params: { tenant_id: tenantId, ...params } }).then((r) => r.data)

export const dismissRecommendation = (tenantId, recId) =>
  client.patch(`/recommendations/${recId}/dismiss`, null, { params: { tenant_id: tenantId } }).then((r) => r.data)
