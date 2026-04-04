import client from './client.js'

export const getAsanaStatus  = ()                     => client.get('/asana/status').then(r => r.data)
export const getConnectUrl   = ()                     => client.get('/asana/oauth/connect').then(r => r.data)
export const getProjects     = ()                     => client.get('/asana/projects').then(r => r.data)
export const getTasks        = ()                     => client.get('/asana/tasks').then(r => r.data)
export const createTask      = (recommendationId, projectId) =>
  client.post('/asana/tasks', { recommendation_id: recommendationId, project_id: projectId }).then(r => r.data)
