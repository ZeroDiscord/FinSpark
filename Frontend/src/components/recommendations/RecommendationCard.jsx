import * as Tooltip from '@radix-ui/react-tooltip'
import { KanbanSquare, Send, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import PriorityBadge from './PriorityBadge.jsx'

const PRIORITY_CARD = {
  critical: {
    border:  'border-rose-500/40',
    accent:  'bg-rose-500',
    glow:    'shadow-[0_0_32px_rgba(244,63,94,0.12)]',
    label:   'text-rose-400',
    metric:  'text-rose-400',
    statBg:  'border-rose-500/20 bg-rose-500/8',
  },
  high: {
    border:  'border-amber-400/40',
    accent:  'bg-amber-400',
    glow:    'shadow-[0_0_32px_rgba(245,158,11,0.10)]',
    label:   'text-amber-400',
    metric:  'text-amber-300',
    statBg:  'border-amber-400/20 bg-amber-500/8',
  },
  medium: {
    border:  'border-cyan-400/30',
    accent:  'bg-cyan-400',
    glow:    '',
    label:   'text-cyan-400',
    metric:  'text-cyan-300',
    statBg:  'border-cyan-400/15 bg-cyan-500/5',
  },
  low: {
    border:  'border-emerald-400/25',
    accent:  'bg-emerald-500',
    glow:    '',
    label:   'text-emerald-400',
    metric:  'text-emerald-300',
    statBg:  'border-emerald-400/15 bg-emerald-500/5',
  },
}

export default function RecommendationCard({
  recommendation,
  asanaConnected,
  onSendToKanban,
  onDismiss,
}) {
  const priority = recommendation.priority || 'medium'
  const cfg      = PRIORITY_CARD[priority] || PRIORITY_CARD.medium
  const disabled = !asanaConnected

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-slate-900/60 backdrop-blur-2xl transition-all duration-300 hover:bg-slate-900/80 ${cfg.border} ${cfg.glow}`}
    >
      {/* Left priority accent bar */}
      <div className={`absolute inset-y-0 left-0 w-1 ${cfg.accent}`} />

      <div className="px-6 py-5 pl-8 space-y-4">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className={`flex items-center gap-2 text-xs font-mono uppercase tracking-widest ${cfg.label}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.accent} ${priority === 'critical' ? 'animate-pulse' : ''}`} />
              {recommendation.feature_name || recommendation.feature || recommendation.title}
            </div>
            <h3 className="text-lg font-semibold text-white leading-snug max-w-2xl">
              {recommendation.problem || recommendation.reason || 'User friction detected'}
            </h3>
            <p className="max-w-2xl text-sm text-slate-400 leading-relaxed">
              {recommendation.suggestion ||
                recommendation.action ||
                'Review the journey, simplify decision points, and remove unnecessary dependencies.'}
            </p>
          </div>
          <PriorityBadge priority={priority} />
        </div>

        {/* Stat tiles */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${cfg.statBg}`}>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Churn score</div>
            <div className={`mt-1.5 text-2xl font-bold ${cfg.metric}`}>
              {Math.round((recommendation.churn_score || recommendation.score || 0) * 100)}%
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${cfg.statBg}`}>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Impact score</div>
            <div className={`mt-1.5 text-2xl font-bold ${cfg.metric}`}>
              {Math.round(recommendation.impact_score || 0)}
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${cfg.statBg}`}>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Category</div>
            <div className="mt-1.5 text-sm text-slate-300 font-medium">
              {recommendation.category || 'analytics'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span>
                  <Button
                    variant={disabled ? 'secondary' : 'default'}
                    disabled={disabled}
                    onClick={() => onSendToKanban(recommendation.id)}
                    className="gap-2"
                  >
                    <KanbanSquare className="h-4 w-4" />
                    Send to Kanban
                  </Button>
                </span>
              </Tooltip.Trigger>
              {!asanaConnected && (
                <Tooltip.Portal>
                  <Tooltip.Content className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                    Connect Asana first
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>
          <Button variant="secondary" className="gap-2">
            <Send className="h-4 w-4" />
            View fix plan
          </Button>
          <Button variant="ghost" className="gap-2" onClick={() => onDismiss(recommendation.id)}>
            <X className="h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
