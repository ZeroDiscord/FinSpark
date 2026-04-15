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
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

const STEPS = [
  { key: 'markov',   label: 'Fitting Markov chain',   icon: GitBranch, desc: 'Building state transition model from sessions' },
  { key: 'lstm',     label: 'Training LSTM encoder',  icon: Brain,     desc: 'Learning temporal churn patterns with BiLSTM' },
  { key: 'rag',      label: 'Indexing RAG documents', icon: BookOpen,  desc: 'Storing embeddings for insight retrieval' },
  { key: 'ensemble', label: 'Assembling ensemble',    icon: Layers,    desc: 'Combining Markov + LSTM + N-gram models' },
]

const PHASE_TO_STEP = { markov: 0, lstm: 1, rag: 2, ensemble: 3 }

function StepRow({ icon: Icon, label, desc, state }) {
  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-500 ${
          state === 'done'
            ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
            : state === 'active'
            ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
            : 'border-white/10 bg-white/5 text-slate-600'
        }`}
      >
        {state === 'active' && (
          <span className="absolute inset-0 rounded-xl animate-ping bg-cyan-400/20" />
        )}
        {state === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin relative z-10" />
        ) : state === 'done' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium transition-colors duration-300 ${
            state === 'done'
              ? 'text-emerald-200'
              : state === 'active'
              ? 'text-white'
              : 'text-slate-500'
          }`}
        >
          {label}
        </div>
        <div className={`text-[11px] transition-colors duration-300 ${
          state === 'active' ? 'text-slate-400' : 'text-slate-600'
        }`}>
          {desc}
        </div>
      </div>
      {state === 'done' && (
        <span className="shrink-0 font-mono text-[10px] text-emerald-500 uppercase tracking-widest">done</span>
      )}
      {state === 'active' && (
        <span className="shrink-0 font-mono text-[10px] text-cyan-400 uppercase tracking-widest animate-pulse">running</span>
      )}
    </motion.div>
  )
}

function EpochBar({ epoch, total, valAuc }) {
  const pct = total > 0 ? Math.round((epoch / total) * 100) : 0
  return (
    <div className="space-y-2 pt-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-cyan-400" />
          Epoch {epoch} / {total}
        </span>
        <span className={`font-mono ${valAuc != null && valAuc > 0.75 ? 'text-emerald-400' : 'text-cyan-400'}`}>
          Val AUC {valAuc != null ? (valAuc * 100).toFixed(1) + '%' : '—'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 relative">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
        {/* shimmer effect */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-slate-600 uppercase tracking-widest">
        <span>LSTM BiLSTM Training</span>
        <span>{pct}%</span>
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

// Animated overall progress bar at the top
function OverallProgress({ activeStep, total, phase }) {
  const pct = phase === 'done' ? 100 : activeStep < 0 ? 5 : Math.round(((activeStep + 0.5) / total) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Overall Progress</span>
        <span className="font-mono text-[10px] text-cyan-400">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full ${phase === 'done' ? 'bg-emerald-400' : 'bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500'}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ backgroundSize: '200% 100%', animation: phase !== 'done' ? 'gradientSlide 2s linear infinite' : undefined }}
        />
      </div>
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
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef(null)
  const timerRef = useRef(null)

  // Auto-start as soon as the panel mounts (triggered by successful CSV upload)
  useEffect(() => {
    if (autoStart && phase === 'idle') {
      startTraining()
    }
    return () => {
      abortRef.current?.abort()
      clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function startTraining() {
    setPhase('training')
    setError(null)
    setTrainResult(null)
    setActiveStep(-1)
    setEpochInfo(null)
    setElapsed(0)

    // Start elapsed timer
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = localStorage.getItem('fs_token')
      const res = await fetch(`${apiBaseUrl}/train/stream`, {
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

      clearInterval(timerRef.current)
      setPhase('done')
      // Redirect to recommendations after a short pause
      setTimeout(() => navigate(`/app/recommendations/${tenantId}`), 2500)
    } catch (err) {
      clearInterval(timerRef.current)
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

  function formatElapsed(s) {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <>
      {/* Global shimmer keyframes (injected once) */}
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes gradientSlide { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-indigo-400/20 bg-gradient-to-b from-indigo-950/60 to-slate-900/80 backdrop-blur-xl p-5 space-y-5 shadow-[0_0_50px_rgba(99,102,241,0.08)]"
      >
        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border shrink-0 ${
            phase === 'done' ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
            : phase === 'error' ? 'border-rose-400/30 bg-rose-500/15 text-rose-300'
            : 'border-indigo-400/40 bg-indigo-500/20 text-indigo-300'
          }`}>
            {phase === 'training' && (
              <span className="absolute inset-0 rounded-2xl animate-ping bg-indigo-400/15" />
            )}
            {phase === 'done'
              ? <CheckCircle2 className="h-5 w-5" />
              : phase === 'error'
              ? <AlertTriangle className="h-5 w-5" />
              : <Sparkles className="h-5 w-5 relative z-10" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-white">
              {phase === 'done' ? '✓ Model trained successfully' : phase === 'error' ? 'Training failed' : 'Training your ML model…'}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {eventsIngested ? (
                <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
                  {eventsIngested.toLocaleString()} events
                </span>
              ) : null}
              <span>Markov · LSTM · RAG · Ensemble</span>
              {phase === 'training' && (
                <span className="font-mono text-slate-500">⏱ {formatElapsed(elapsed)}</span>
              )}
            </div>
          </div>
          {phase === 'training' && (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Live
            </div>
          )}
        </div>

        {/* ── Overall progress bar ─────────────────────────── */}
        {phase !== 'idle' && phase !== 'error' && (
          <OverallProgress activeStep={activeStep} total={STEPS.length} phase={phase} />
        )}

        {/* ── Step progress ────────────────────────────────── */}
        <AnimatePresence>
          {phase !== 'idle' ? (
            <motion.div
              key="steps"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/50 p-4"
            >
              {STEPS.map((step, i) => (
                <StepRow
                  key={step.key}
                  icon={step.icon}
                  label={step.label}
                  desc={step.desc}
                  state={getStepState(i)}
                />
              ))}

              {/* Epoch progress bar — only visible while LSTM is active */}
              {phase === 'training' && activeStep === 1 && epochInfo ? (
                <div className="pt-1 border-t border-white/5">
                  <EpochBar
                    epoch={epochInfo.epoch}
                    total={epochInfo.total}
                    valAuc={epochInfo.val_auc}
                  />
                </div>
              ) : null}

              {/* Waiting indicator when step is -1 (initializing) */}
              {phase === 'training' && activeStep === -1 && (
                <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Initializing model pipeline…
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Error ────────────────────────────────────────── */}
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

        {/* ── Results ──────────────────────────────────────── */}
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

              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/8 px-4 py-2.5 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Model trained — opening recommendations in a moment…</span>
                <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin opacity-60" />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
