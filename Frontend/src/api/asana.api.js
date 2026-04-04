import client from './client.js'

export const getAsanaStatus = (tenantId) =>
  client.get('/asana/status', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getConnectUrl = (tenantId) =>
  client.get('/asana/oauth/connect', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getWorkspaces = (tenantId) =>
  client.get('/asana/workspaces', { params: { tenant_id: tenantId } }).then((r) => r.data)

export const getProjects = (tenantId, workspaceId) =>
  client.get('/asana/projects', { params: { tenant_id: tenantId, workspace_id: workspaceId } }).then((r) => r.data)

export const getSections = (tenantId, projectId) =>
  client.get('/asana/sections', { params: { tenant_id: tenantId, project_id: projectId } }).then((r) => r.data)

export const saveMapping = (tenantId, payload) =>
  client.post('/asana/mapping', payload, { params: { tenant_id: tenantId } }).then((r) => r.data)

export const createTask = (tenantId, payload) =>
  client.post('/asana/task', payload, { params: { tenant_id: tenantId } }).then((r) => r.data)

export const sendBulk = (tenantId, payload) =>
  client.post('/asana/send-bulk', payload, { params: { tenant_id: tenantId } }).then((r) => r.data)
