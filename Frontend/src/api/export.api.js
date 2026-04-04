export const getCsvUrl = (tenantId, type) => `/api/export/${tenantId}/csv?type=${type}`
export const getPowerBIUrl = (tenantId, format = 'csv') => `/api/export/powerbi?tenant_id=${tenantId}&format=${format}`
export const getPowerBIJsonUrl = (tenantId) => `/api/export/powerbi?tenant_id=${tenantId}&format=json`
export const getPowerBIPushUrl = () => '/api/export/powerbi/push'

export function downloadFile(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || ''
  a.click()
}
