import client from './client.js'

const base = (id) => `/dashboard/${id}`

export const getOverview         = (id)      => client.get(`${base(id)}/overview`).then(r => r.data)
export const getHeatmap          = (id)      => client.get(`${base(id)}/heatmap`).then(r => r.data)
export const getFunnel           = (id)      => client.get(`${base(id)}/funnel`).then(r => r.data)
export const getChurnDistribution= (id)      => client.get(`${base(id)}/churn-distribution`).then(r => r.data)
export const getDashFriction     = (id)      => client.get(`${base(id)}/friction`).then(r => r.data)
export const getFeatureUsage     = (id)      => client.get(`${base(id)}/feature-usage`).then(r => r.data)
export const getSegmentation     = (id)      => client.get(`${base(id)}/segmentation`).then(r => r.data)
export const getSessions         = (id, limit) => client.get(`${base(id)}/sessions`, { params: { limit } }).then(r => r.data)
export const getInsight          = (id, question) => client.get(`${base(id)}/insight`, { params: { question } }).then(r => r.data)
export const getTransitionMatrix = (id)      => client.get(`${base(id)}/transition-matrix`).then(r => r.data)
