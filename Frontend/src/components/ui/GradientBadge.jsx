import { cn } from '../../lib/utils.js'

export default function GradientBadge({ className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-100',
        className,
      )}
    >
      {children}
    </span>
  )
}
