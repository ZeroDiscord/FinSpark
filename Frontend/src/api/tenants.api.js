import client from './client.js'

export const getTenants  = ()           => client.get('/tenants').then(r => r.data)
export const getTenant   = (id)         => client.get(`/tenants/${id}`).then(r => r.data)
export const trainTenant = (id, augment) => client.post(`/tenants/${id}/train`, { augment }).then(r => r.data)
