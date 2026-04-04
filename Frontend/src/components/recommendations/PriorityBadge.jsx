export default function PriorityBadge({ priority = 'medium' }) {
  const styles = {
    critical: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
    high: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
    medium: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200',
    low: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
  }

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${styles[priority] || styles.medium}`}>
      {priority}
    </span>
  )
}
