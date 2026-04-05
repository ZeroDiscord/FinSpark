import { useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Search } from 'lucide-react'

function ChurnRiskBadge({ rate }) {
  if (rate == null) return <span className="text-slate-600 font-mono text-xs">—</span>
  const pct = (rate * 100).toFixed(1)
  if (rate >= 0.5)
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 font-mono text-xs font-bold text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
        {pct}%
      </span>
    )
  if (rate >= 0.25)
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {pct}%
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {pct}%
    </span>
  )
}

function SuccessBar({ rate }) {
  if (rate == null) return <span className="text-slate-600 font-mono text-xs">—</span>
  const pct = rate * 100
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-mono text-[10px] text-slate-400 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

const COLS = [
  { key: 'feature', label: 'Feature', sortable: true },
  { key: 'usage_count', label: 'Usage', sortable: true },
  { key: 'avg_duration_ms', label: 'Avg Duration', sortable: true },
  { key: 'success_rate', label: 'Success Rate', sortable: true },
  { key: 'churn_rate', label: 'Churn Risk', sortable: true },
]

export default function FeatureTable({ featureUsage, friction }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('churn_rate')
  const [sortDir, setSortDir] = useState('desc')

  const frictionMap = useMemo(
    () => Object.fromEntries((friction || []).map((f) => [f.feature, f])),
    [friction]
  )

  const rows = useMemo(() => {
    const base = (featureUsage || []).map((u) => ({
      ...u,
      // derive success_rate as 1 - churn_rate if not present
      success_rate: u.success_rate != null ? u.success_rate : u.churn_rate != null ? 1 - u.churn_rate : null,
      friction: frictionMap[u.feature] || null,
    }))

    const filtered = query
      ? base.filter((r) => r.feature?.toLowerCase().includes(query.toLowerCase()))
      : base

    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? -1
      const bv = b[sortKey] ?? -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [featureUsage, friction, query, sortKey, sortDir, frictionMap])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (!featureUsage?.length) {
    return (
      <div className="flex h-32 items-center justify-center font-mono text-xs text-slate-500">
        Awaiting feature usage data…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter features…"
          className="w-full rounded-xl border border-white/8 bg-slate-900/60 pl-8 pr-3 py-2 font-mono text-xs text-slate-300 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/5">
              {COLS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`px-3 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-slate-500 select-none ${col.sortable ? 'cursor-pointer hover:text-slate-300' : ''}`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key ? (
                      sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-emerald-400" /> : <ChevronDown className="h-3 w-3 text-emerald-400" />
                    ) : col.sortable ? (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row, i) => {
              const isFriction = row.friction?.severity === 'critical' || row.friction?.severity === 'high'
              return (
                <tr
                  key={row.feature}
                  className={`border-b border-white/3 transition-colors hover:bg-white/3 ${i % 2 === 0 ? 'bg-slate-900/20' : ''}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {isFriction && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                      )}
                      <span className={`font-mono text-[11px] ${isFriction ? 'text-rose-300' : 'text-slate-300'}`}>
                        {(row.feature || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                    {row.usage_count?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                    {row.avg_duration_ms != null ? `${Math.round(row.avg_duration_ms)} ms` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <SuccessBar rate={row.success_rate} />
                  </td>
                  <td className="px-3 py-2">
                    <ChurnRiskBadge rate={row.churn_rate} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > 12 && (
          <div className="px-3 py-2 text-center font-mono text-[9px] text-slate-600">
            +{rows.length - 12} more rows — refine search to filter
          </div>
        )}
      </div>
    </div>
  )
}
