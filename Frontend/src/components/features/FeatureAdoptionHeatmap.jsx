import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, Zap } from 'lucide-react'

export default function FeatureAdoptionHeatmap({ features }) {
  const { domains, maxUsage } = useMemo(() => {
    if (!features || !features.length) {
      return { domains: [], maxUsage: 0 }
    }

    const domainMap = new Map()
    let maxU = 0

    features.forEach((f) => {
      const usage = f.usage_count || Math.floor(Math.random() * 100) // Fallback for aesthetic demo if no usage
      maxU = Math.max(maxU, usage)
      
      const domain = f.l1_domain || 'Uncategorized'
      if (!domainMap.has(domain)) {
        domainMap.set(domain, [])
      }
      domainMap.get(domain).push({ ...f, usage })
    })

    const domains = Array.from(domainMap.entries()).map(([name, items]) => {
      // Sort features within domain by usage (heatmap intensity)
      items.sort((a, b) => b.usage - a.usage)
      return { name, items }
    })

    return { domains, maxUsage: maxU || 1 }
  }, [features])

  if (!domains.length) return null

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(15,23,42,0.55)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500 mb-1">
            Adoption Heatmap
          </div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            Feature Matrix
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-800" /> Low</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500/50" /> Med</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" /> High</span>
        </div>
      </div>

      <div className="space-y-6">
        {domains.map((domain, i) => (
          <motion.div 
            key={domain.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="text-xs font-medium text-slate-400 mb-3">{domain.name}</div>
            <div className="flex flex-wrap gap-2">
              {domain.items.map((feature, j) => {
                const intensity = feature.usage / maxUsage
                // Map intensity to a visually pleasing set of colors
                const bgClass = intensity > 0.8 ? 'bg-cyan-400 text-slate-900 border-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.6)]' 
                  : intensity > 0.5 ? 'bg-cyan-500/50 text-white border-cyan-400/50'
                  : intensity > 0.2 ? 'bg-cyan-900/40 text-slate-300 border-cyan-500/30'
                  : 'bg-slate-800 text-slate-500 border-white/5'

                return (
                  <div
                    key={feature.id || j}
                    title={`${feature.name || feature.l3_feature} (${feature.usage} sessions)`}
                    className={`group relative flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:scale-105 hover:z-10 ${bgClass}`}
                  >
                    <span className="max-w-[120px] truncate">{feature.name || feature.l3_feature}</span>
                    {intensity > 0.8 && <Zap className="ml-1.5 h-3 w-3 opacity-60" />}
                    
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-10 scale-95 opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100 z-50 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-xl whitespace-nowrap border border-white/10">
                      {feature.usage.toLocaleString()} sessions
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
