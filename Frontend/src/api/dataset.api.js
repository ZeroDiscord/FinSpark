import client from './client.js'

export async function fetchEvents(tenantId, { page = 1, limit = 50, search = '', feature = '', deploymentType = '', success = '' } = {}) {
  const params = new URLSearchParams({ page, limit })
  if (search)         params.set('search', search)
  if (feature)        params.set('feature', feature)
  if (deploymentType) params.set('deployment_type', deploymentType)
  if (success !== '')  params.set('success', success)
  const res = await client.get(`/events?tenant_id=${tenantId}&${params}`)
  return res.data
}

export function getExportCsvUrl(tenantId) {
  return `/api/export/${tenantId}/csv?type=events`
}
