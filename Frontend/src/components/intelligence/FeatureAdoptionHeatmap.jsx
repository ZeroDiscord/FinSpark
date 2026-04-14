import { motion } from 'framer-motion'

function FeatureTile({ feature, usageCount, usagePct, churnRate, i }) {
  // intensity is based on usagePct (0 to 1)
  const intensity = Math.min(Math.max(usagePct || 0, 0), 1)

  // Color logic - glassmorphism approach
  const alpha = 0.05 + intensity * 0.4
  const bg = `rgba(16, 185, 129, ${alpha})`
  const borderColor = `rgba(16, 185, 129, ${0.1 + intensity * 0.5})`

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay: i * 0.03, type: 'spring', stiffness: 200 }}
      className="group relative flex flex-col items-center justify-center rounded-2xl border p-5 text-center shadow-lg transition-all hover:scale-105 hover:z-10 hover:shadow-emerald-500/20 backdrop-blur-md"
      style={{
        backgroundColor: bg,
        borderColor: borderColor,
        boxShadow: `inset 0 0 20px rgba(16, 185, 129, ${alpha * 0.5})`
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-white/30 to-transparent mix-blend-overlay" />
      <span className="mb-2 w-full truncate px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-300 drop-shadow-sm">
        {feature.replace(/_/g, ' ')}
      </span>
      <span className="text-2xl font-black text-white drop-shadow-md tracking-tight">
        {Math.round((usagePct || 0) * 100)}<span className="text-sm text-emerald-300">%</span>
      </span>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50 w-[180px] rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="absolute -bottom-2 left-1/2 -mr-px h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-slate-900/95" />
        <div className="mb-2 border-b border-white/10 pb-2 text-center text-xs font-bold text-slate-100 truncate">
          {feature.replace(/_/g, ' ')}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-slate-400">
          <span>Usage</span>
          <span className="text-right font-medium text-slate-200">{usageCount?.toLocaleString() || 0}</span>
          <span>Adoption</span>
          <span className="text-right font-medium text-emerald-400">{((usagePct || 0) * 100).toFixed(1)}%</span>
          <span>Churn Risk</span>
          <span className="text-right font-medium text-rose-400">{((churnRate || 0) * 100).toFixed(1)}%</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function FeatureAdoptionHeatmap({ featureUsage }) {
  if (!featureUsage?.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-xs font-mono text-slate-500">
        Awaiting feature usage data…
      </div>
    )
  }

  const EXCLUDE = new Set(['drop_off', 'session_end', 'exit', 'error'])
  let tiles = featureUsage.filter((u) => !EXCLUDE.has(u.feature) && Number(u.usage_count || 0) > 0)
  
  // Calculate relative adoption if usage_pct is missing
  const maxUsage = Math.max(...tiles.map((t) => Number(t.usage_count || 0)), 1)
  tiles = tiles.map(t => ({
    ...t,
    usage_pct: t.usage_pct ?? (Number(t.usage_count || 0) / maxUsage)
  }))

  tiles.sort((a, b) => Number(b.usage_pct || 0) - Number(a.usage_pct || 0))

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" style={{ minHeight: 220 }}>
      {tiles.map((u, i) => (
        <FeatureTile
          key={u.feature}
          i={i}
          feature={u.feature}
          usageCount={Number(u.usage_count || 0)}
          usagePct={Number(u.usage_pct || 0)}
          churnRate={Number(u.churn_rate || 0)}
        />
      ))}
    </div>
  )
}
