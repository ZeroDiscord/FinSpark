import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from './Card.jsx'
import LoadingSkeleton from './LoadingSkeleton.jsx'

export default function ChartContainer({
  title,
  subtitle,
  actions,
  children,
  loading,
  error,
  className,
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
        {loading ? (
          <LoadingSkeleton rows={5} className="border-0 bg-transparent p-0 shadow-none" />
        ) : error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
