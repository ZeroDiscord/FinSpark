import client from './client.js'

export const getSnippets = (tenantId, lang) =>
  client.get(`/tracking/${tenantId}/snippets`, { params: lang ? { lang } : {} }).then(r => r.data)

export const getDownloadUrl = (tenantId, lang) => `/api/tracking/${tenantId}/snippets/${lang}/download`
