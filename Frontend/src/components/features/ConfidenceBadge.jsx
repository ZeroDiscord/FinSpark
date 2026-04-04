export default function ConfidenceBadge({ score = 0 }) {
  const color =
    score >= 0.85
      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
      : score >= 0.65
        ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200'
        : 'border-amber-400/20 bg-amber-500/10 text-amber-200'

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${color}`}>
      {Math.round(score * 100)}% confidence
    </span>
  )
}
