import client from './client.js'

export async function trainModel(tenantId, augment = false) {
  const res = await client.post('/ml/train', { tenant_id: tenantId, augment })
  return res.data
}

/**
 * Returns an EventSource that streams /ml/train/stream SSE events.
 * The caller must close it when done.
 * @param {string} tenantId
 * @param {boolean} augment
 * @returns {EventSource}
 */
export function trainModelStream(tenantId, augment = false) {
  // SSE via POST is not natively supported by EventSource.
  // We use fetch + ReadableStream instead and emit synthetic events.
  return { tenantId, augment } // marker — handled in useTrainStream hook
}

export async function predictSessions(tenantId) {
  const res = await client.post('/ml/analyze', { tenant_id: tenantId })
  return res.data
}
