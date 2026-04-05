import client from './client.js'

export function trainModel(tenantId, augment = false) {
  return client.post('/train', { tenant_id: tenantId, augment }, { timeout: 180_000 }).then(r => r.data)
}

export function uploadApk(file) {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload/apk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
  }).then(r => r.data)
}

export function uploadUrl(url, crawlDepth = 0, { manualPaths, selectedPaths } = {}) {
  return client.post('/upload/url', {
    url,
    crawl_depth: crawlDepth,
    manual_paths: manualPaths,
    selected_paths: selectedPaths,
  }, { timeout: 300_000 }).then(r => r.data)
}

export function uploadCsv(file) {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload/csv', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
  }).then(r => r.data)
}

export function discoverPaths(url, { maxPages = 50, maxDepth = 3 } = {}) {
  return client.post('/upload/discover-paths', { url, max_pages: maxPages, max_depth: maxDepth }, {
    timeout: 300_000,
  }).then(r => r.data)
}

export function uploadLogFile(file) {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload/log', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
  }).then(r => r.data)
}

export function generatePathLoggerSnippet(file, logDir = './logs') {
  const form = new FormData()
  form.append('file', file)
  form.append('log_dir', logDir)
  return client.post('/upload/path-logger', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
  }).then(r => r.data)
}

export function getLoggerSnippet(framework = 'express', logDir = './logs') {
  return client.get('/upload/logger-snippet', {
    params: { framework, log_dir: logDir },
  }).then(r => r.data)
}
