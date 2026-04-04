import client from './client.js'

export function uploadApk(file) {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload/apk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  }).then(r => r.data)
}

export function uploadUrl(url, crawlDepth = 0) {
  return client.post('/upload/url', { url, crawl_depth: crawlDepth }).then(r => r.data)
}

export function uploadCsv(file) {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload/csv', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  }).then(r => r.data)
}
