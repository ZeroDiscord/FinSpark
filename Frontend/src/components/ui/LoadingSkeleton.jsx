import { cn } from '../../lib/utils.js'

export default function LoadingSkeleton({ variant = 'card', rows = 3, className }) {
  if (variant === 'table') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('glass-panel rounded-3xl p-6', className)}>
      <div className="mb-4 h-5 w-32 animate-pulse rounded-full bg-white/10" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-4 animate-pulse rounded-full bg-white/5" />
        ))}
      </div>
    </div>
  )
}
