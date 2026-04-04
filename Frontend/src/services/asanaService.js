import { getAsanaStatus, getConnectUrl, getProjects } from '../api/asana.api.js'

export async function fetchAsanaStatus() {
  return getAsanaStatus()
}

export async function startAsanaConnect() {
  return getConnectUrl()
}

export async function fetchAsanaWorkspaces() {
  const status = await getAsanaStatus()
  return status.workspace_name ? [{ id: status.workspace_id || 'default', name: status.workspace_name }] : []
}

export async function fetchAsanaProjects() {
  return getProjects()
}

export async function saveAsanaMapping({ workspaceId, projectId, columnId }) {
  return { workspaceId, projectId, columnId, saved: true }
}
