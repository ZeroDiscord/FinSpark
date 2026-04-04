export const getCsvUrl     = (tenantId, type) => `/api/export/${tenantId}/csv?type=${type}`
export const getPowerBIUrl = (tenantId)        => `/api/export/${tenantId}/powerbi`

export function downloadFile(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || ''
  a.click()
}
