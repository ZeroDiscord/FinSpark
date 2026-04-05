import { useParams } from 'react-router-dom'
import { Brain, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import { useTrainStream } from '../hooks/useTrainStream.js'

function MetricBadge({ label, value }) {
  const pct = typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : value
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center">
      <div className="text-2xl font-semibold text-white">{pct}</div>
      <div className="mt-1 text-xs text-slate-400 uppercase tracking-widest">{label}</div>
    </div>
  )
}

export default function TrainPage() {
  const { tenantId } = useParams()
  const { status, progress, metrics, log, start, cancel } = useTrainStream()
  const [augment, setAugment]       = useState(false)
  const [showLog, setShowLog]       = useState(false)

  const isRunning   = status === 'running'
  const isComplete  = status === 'complete'
  const isError     = status === 'error'

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="ML pipeline"
        title="Train model"
        description="Sends the collected event dataset to the ML service and streams epoch-by-epoch progress. After training, view accuracy metrics and feature recommendations."
      />

      {/* Controls */}
      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={augment}
                onChange={e => setAugment(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Augment training data
            </label>
            <span className="text-xs text-slate-500">Applies synthetic oversampling for class imbalance correction.</span>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => start(tenantId, augment)}
              disabled={isRunning || !tenantId}
              className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6"
            >
              <Brain className="h-4 w-4" />
              {isRunning ? 'Training…' : 'Train'}
            </Button>
            {isRunning && (
              <Button variant="ghost" onClick={cancel} className="text-slate-400 hover:text-rose-300">
                Cancel
              </Button>
            )}
          </div>

          {/* Progress bar */}
          {(isRunning || isComplete || isError) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {isRunning   ? 'Training in progress…' :
                   isComplete  ? 'Training complete' :
                   'Training failed'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isError    ? 'bg-rose-500' :
                    isComplete ? 'bg-emerald-400' :
                    'bg-indigo-400 animate-pulse'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      {isComplete && metrics && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-300 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Model trained successfully
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {metrics.accuracy  != null && <MetricBadge label="Accuracy"  value={metrics.accuracy} />}
            {metrics.precision != null && <MetricBadge label="Precision" value={metrics.precision} />}
            {metrics.recall    != null && <MetricBadge label="Recall"    value={metrics.recall} />}
            {metrics.f1        != null && <MetricBadge label="F1"        value={metrics.f1} />}
            {metrics.roc_auc   != null && <MetricBadge label="ROC-AUC"  value={metrics.roc_auc} />}
          </div>

          {/* Recommendations from training */}
          {Array.isArray(metrics.recommendations) && metrics.recommendations.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                <div className="text-sm font-semibold text-white">Recommended features</div>
                <ul className="space-y-2">
                  {metrics.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 mt-2" />
                      {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Feature importance table */}
          {Array.isArray(metrics.feature_importance) && metrics.feature_importance.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                <div className="text-sm font-semibold text-white">Feature importance</div>
                <div className="space-y-2">
                  {metrics.feature_importance.slice(0, 10).map((fi, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-40 text-xs text-slate-400 truncate">{fi.feature}</div>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-400"
                          style={{ width: `${Math.min(100, fi.importance * 100)}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-xs text-slate-400">
                        {(fi.importance * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <XCircle className="h-4 w-4 shrink-0" />
          Training failed. Check the epoch log below for details.
        </div>
      )}

      {/* Epoch log */}
      {log.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <button
              onClick={() => setShowLog(v => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span>Epoch log ({log.length} entries)</span>
              {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showLog && (
              <div className="max-h-64 overflow-y-auto rounded-2xl bg-slate-950/70 p-4 font-mono text-xs text-slate-400 space-y-1">
                {log.map((entry, i) => (
                  <div key={i}>{entry}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
