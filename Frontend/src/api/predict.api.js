import client from './client.js'

export const predict = (data) => client.post('/predict', data).then(r => r.data)
