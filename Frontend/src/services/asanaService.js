import {
  createTask,
  getAsanaStatus,
  getConnectUrl,
  getProjects,
  getSections,
  getWorkspaces,
  saveMapping,
  sendBulk,
} from '../api/asana.api.js'

export async function fetchAsanaStatus(tenantId) {
  return getAsanaStatus(tenantId)
}

export async function startAsanaConnect(tenantId) {
  return getConnectUrl(tenantId)
}

export async function fetchAsanaWorkspaces(tenantId) {
  return getWorkspaces(tenantId)
}

export async function fetchAsanaProjects(tenantId, workspaceId) {
  if (!workspaceId) return []
  return getProjects(tenantId, workspaceId)
}

export async function fetchAsanaSections(tenantId, projectId) {
  if (!projectId) return []
  return getSections(tenantId, projectId)
}

export async function saveAsanaMapping(tenantId, { workspaceId, projectId, columnId }) {
  return saveMapping(tenantId, {
    workspace_id: workspaceId,
    project_id: projectId,
    section_id: columnId,
  })
}

export async function createAsanaTask(tenantId, payload) {
  return createTask(tenantId, payload)
}

export async function bulkSendRecommendations(tenantId, payload) {
  return sendBulk(tenantId, payload)
}
