import { useState, useRef, useCallback } from 'react'

/**
 * Streams training progress from POST /api/ml/train/stream
 * The ML service emits SSE events: epoch_end, complete, error
 */
export function useTrainStream() {
  const [status, setStatus]     = useState('idle')   // idle | running | complete | error
  const [progress, setProgress] = useState(0)
  const [metrics, setMetrics]   = useState(null)
  const [log, setLog]           = useState([])
  const abortRef = useRef(null)

  const start = useCallback(async (tenantId, augment = false) => {
    setStatus('running')
    setProgress(0)
    setMetrics(null)
    setLog([])

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ml/train/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, augment }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const payload = JSON.parse(line.slice(5).trim())

            if (payload.event === 'epoch_end' || payload.epoch !== undefined) {
              const pct = payload.total_epochs
                ? Math.round((payload.epoch / payload.total_epochs) * 100)
                : payload.progress ?? 0
              setProgress(pct)
              setLog(prev => [...prev, `Epoch ${payload.epoch}/${payload.total_epochs ?? '?'} — loss: ${payload.loss?.toFixed?.(4) ?? payload.loss}`])
            }

            if (payload.event === 'complete' || payload.status === 'success') {
              setProgress(100)
              setMetrics(payload)
              setStatus('complete')
              setLog(prev => [...prev, '✓ Training complete'])
            }

            if (payload.event === 'error' || payload.detail) {
              throw new Error(payload.detail || JSON.stringify(payload))
            }
          } catch (parseErr) {
            if (parseErr.message?.startsWith('{')) throw parseErr
            // ignore non-JSON lines
          }
        }
      }

      // If stream ended without a complete event, treat last data as metrics
      setStatus(prev => prev === 'running' ? 'complete' : prev)
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('idle')
      } else {
        setStatus('error')
        setLog(prev => [...prev, `Error: ${err.message}`])
      }
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { status, progress, metrics, log, start, cancel }
}
