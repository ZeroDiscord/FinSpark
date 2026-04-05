import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  GitBranch,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  { key: 'markov',   label: 'Fitting Markov chain',   icon: GitBranch },
  { key: 'lstm',     label: 'Training LSTM encoder',  icon: Brain },
  { key: 'rag',      label: 'Indexing RAG documents', icon: BookOpen },
  { key: 'ensemble', label: 'Assembling ensemble',    icon: Layers },
]

const PHASE_TO_STEP = { markov: 0, lstm: 1, rag: 2, ensemble: 3 }

function StepRow({ icon: Icon, label, state }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-500 ${
          state === 'done'
            ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
            : state === 'active'
            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
            : 'border-white/10 bg-white/5 text-slate-500'
        }`}
      >
        {state === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'done' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <span
        className={`text-sm transition-colors duration-300 ${
          state === 'done'
            ? 'text-emerald-200'
            : state === 'active'
            ? 'text-white'
            : 'text-slate-500'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

function EpochBar({ epoch, total, valAuc }) {
  const pct = total > 0 ? Math.round((epoch / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Epoch {epoch} / {total}</span>
        <span>Val AUC {valAuc != null ? (valAuc * 100).toFixed(1) + '%' : '—'}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-cyan-400"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border px-5 py-4 ${color}`}>
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="mt-1 text-xs text-slate-400">{label}</span>
    </div>
  )
}

export default function TrainModelPanel({ tenantId, eventsIngested, autoStart = false }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle') // idle | training | done | error
  const [activeStep, setActiveStep] = useState(-1)
  const [epochInfo, setEpochInfo] = useState(null) // { epoch, total, val_auc }
  const [trainResult, setTrainResult] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  // Auto-start as soon as the panel mounts (triggered by successful CSV upload)
  useEffect(() => {
    if (autoStart && phase === 'idle') {
      startTraining()
    }
    return () => abortRef.current?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function startTraining() {
    setPhase('training')
    setError(null)
    setTrainResult(null)
    setActiveStep(-1)
    setEpochInfo(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = localStorage.getItem('fs_token')
      const res = await fetch('/api/train/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tenant_id: tenantId, augment: false }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE frames from buffer
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? '' // last incomplete chunk stays in buffer

        for (const frame of frames) {
          const lines = frame.trim().split('\n')
          let eventType = 'message'
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            if (line.startsWith('data: ')) dataLine = line.slice(6).trim()
          }
          if (!dataLine) continue

          let payload
          try { payload = JSON.parse(dataLine) } catch { continue }

          if (eventType === 'phase') {
            const step = PHASE_TO_STEP[payload.phase]
            if (step != null) setActiveStep(step)
            if (payload.phase === 'done') {
              setActiveStep(STEPS.length) // mark all done
            }
          } else if (eventType === 'epoch') {
            setEpochInfo({ epoch: payload.epoch, total: payload.total, val_auc: payload.val_auc })
          } else if (eventType === 'result') {
            setTrainResult(payload)
          } else if (eventType === 'error') {
            throw new Error(payload.detail || 'Training failed.')
          }
        }
      }

      setPhase('done')
      // Redirect to recommendations after a short pause
      setTimeout(() => navigate(`/app/recommendations/${tenantId}`), 2000)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Training failed.')
      setPhase('error')
      setActiveStep(-1)
    }
  }

  function getStepState(index) {
    if (phase === 'done') return 'done'
    if (index < activeStep) return 'done'
    if (index === activeStep) return 'active'
    return 'pending'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-indigo-400/20 bg-indigo-500/10 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/20 text-indigo-300 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-white">
            {phase === 'done' ? 'Model trained' : phase === 'error' ? 'Training failed' : 'Training model…'}
          </div>
          <div className="text-xs text-slate-400">
            {eventsIngested ? `${eventsIngested} events ingested · ` : ''}
            Markov · LSTM · RAG · Ensemble
          </div>
        </div>
      </div>

      {/* Step progress */}
      <AnimatePresence>
        {phase !== 'idle' ? (
          <motion.div
            key="steps"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 p-4"
          >
            {STEPS.map((step, i) => (
              <StepRow key={step.key} icon={step.icon} label={step.label} state={getStepState(i)} />
            ))}

            {/* Epoch progress bar — only visible while LSTM is active */}
            {phase === 'training' && activeStep === 1 && epochInfo ? (
              <div className="pt-2">
                <EpochBar
                  epoch={epochInfo.epoch}
                  total={epochInfo.total}
                  valAuc={epochInfo.val_auc}
                />
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {phase === 'error' ? (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={startTraining}
              className="ml-2 shrink-0 rounded-lg border border-rose-400/30 bg-rose-500/20 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/30"
            >
              Retry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {phase === 'done' && trainResult ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <StatPill
                label="Markov States"
                value={trainResult.markov_states ?? '—'}
                color="border-indigo-400/20 bg-indigo-500/10"
              />
              <StatPill
                label="LSTM Val AUC"
                value={
                  trainResult.lstm_val_auc != null
                    ? (trainResult.lstm_val_auc * 100).toFixed(1) + '%'
                    : '—'
                }
                color="border-cyan-400/20 bg-cyan-500/10"
              />
              <StatPill
                label="RAG Documents"
                value={trainResult.rag_documents ?? '—'}
                color="border-emerald-400/20 bg-emerald-500/10"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Model trained — opening recommendations…
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
