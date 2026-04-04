import client from './client.js'

export const getFeatures     = (tenantId, params) => client.get(`/features/${tenantId}`, { params }).then(r => r.data)
export const getFriction     = (tenantId)          => client.get(`/features/${tenantId}/friction`).then(r => r.data)
export const getCooccurrence = (tenantId, feature, topK = 5) =>
  client.get(`/features/${tenantId}/cooccurrence`, { params: { feature, top_k: topK } }).then(r => r.data)
