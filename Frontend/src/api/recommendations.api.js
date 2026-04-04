import client from './client.js'

export const getRecommendations = (tenantId, params) =>
  client.get(`/recommendations/${tenantId}`, { params }).then(r => r.data)

export const dismissRecommendation = (tenantId, recId) =>
  client.patch(`/recommendations/${tenantId}/${recId}/dismiss`).then(r => r.data)
