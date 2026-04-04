import * as Tooltip from '@radix-ui/react-tooltip'
import { AlertTriangle, KanbanSquare, Send, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { Card, CardContent } from '../ui/Card.jsx'
import PriorityBadge from './PriorityBadge.jsx'

export default function RecommendationCard({
  recommendation,
  asanaConnected,
  onSendToKanban,
  onDismiss,
}) {
  const disabled = !asanaConnected

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-cyan-300">
              <AlertTriangle className="h-4 w-4" />
              Feature: {recommendation.feature_name || recommendation.feature || recommendation.title}
            </div>
            <h3 className="text-xl font-semibold text-white">
              {recommendation.problem || recommendation.reason || 'User friction detected'}
            </h3>
            <p className="max-w-2xl text-sm text-slate-400">
              {recommendation.suggestion ||
                recommendation.action ||
                'Review the journey, simplify decision points, and remove unnecessary dependencies.'}
            </p>
          </div>
          <PriorityBadge priority={recommendation.priority || 'medium'} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Churn score</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {Math.round((recommendation.churn_score || recommendation.score || 0.72) * 100)}%
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Suggested action</div>
            <div className="mt-2 text-sm text-slate-300">
              {recommendation.suggestion || recommendation.action || 'Reorder the step to reduce abandonment.'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Impact</div>
            <div className="mt-2 text-sm text-slate-300">
              {recommendation.impact || 'High-value user flow at risk'}
            </div>
          </div>
        </div>
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
              {!asanaConnected ? (
                <Tooltip.Portal>
                  <Tooltip.Content className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                    Connect Asana first
                  </Tooltip.Content>
                </Tooltip.Portal>
              ) : null}
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
      </CardContent>
    </Card>
  )
}
