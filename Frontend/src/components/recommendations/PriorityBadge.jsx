import { AlertOctagon, AlertTriangle, ArrowDown, Info } from 'lucide-react'

const CONFIG = {
  critical: {
    icon: AlertOctagon,
    label: 'Critical',
    classes: 'border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.25)]',
    dot: 'bg-rose-500 animate-pulse',
  },
  high: {
    icon: AlertTriangle,
    label: 'High',
    classes: 'border-amber-400/60 bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
    dot: 'bg-amber-400',
  },
  medium: {
    icon: Info,
    label: 'Medium',
    classes: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300',
    dot: 'bg-cyan-400',
  },
  low: {
    icon: ArrowDown,
    label: 'Low',
    classes: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
}

export default function PriorityBadge({ priority = 'medium' }) {
  const cfg = CONFIG[priority] || CONFIG.medium
  const Icon = cfg.icon

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide ${cfg.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}
