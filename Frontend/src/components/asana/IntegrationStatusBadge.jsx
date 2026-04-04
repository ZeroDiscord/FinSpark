export default function IntegrationStatusBadge({ connected, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
        connected
          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
          : 'border-slate-400/20 bg-white/5 text-slate-300'
      }`}
    >
      {label}
    </span>
  )
}
