import { cn } from '../../lib/utils.js'

export function Card({ className, children }) {
  return <div className={cn('glass-panel rounded-3xl', className)}>{children}</div>
}

export function CardContent({ className, children }) {
  return <div className={cn('p-6', className)}>{children}</div>
}
