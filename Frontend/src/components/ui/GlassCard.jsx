import clsx from 'clsx'

export default function GlassCard({ children, className, padding = true, ...props }) {
  return (
    <div
      className={clsx('glass fade-in', padding && 'card-padding', className)}
      style={{ padding: padding ? '1.5rem' : undefined, ...props.style }}
      {...props}
    >
      {children}
    </div>
  )
}
