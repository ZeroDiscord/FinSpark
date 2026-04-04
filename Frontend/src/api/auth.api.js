import client from './client.js'

export const register = (data) => client.post('/auth/register', data).then(r => r.data)
export const login    = (data) => client.post('/auth/login',    data).then(r => r.data)
export const refresh  = (data) => client.post('/auth/refresh',  data).then(r => r.data)
export const logout   = (data) => client.post('/auth/logout',   data).then(r => r.data)
