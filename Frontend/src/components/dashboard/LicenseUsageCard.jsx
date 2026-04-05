import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PackageCheck } from 'lucide-react'
import ChartContainer from '../ui/ChartContainer.jsx'
import client from '../../api/client.js'

export default function LicenseUsageCard({ tenantId }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    client
      .get(`/dashboard/${tenantId}/license-usage`)
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load license data'))
      .finally(() => setLoading(false))
  }, [tenantId])

  const chartData = (data?.by_module || []).map((row) => ({
    module:   row.module,
    Licensed: row.licensed,
    Used:     row.used,
    Unused:   row.licensed - row.used,
  }))

  const unusedPct = data?.unused_pct ?? 0

  return (
    <ChartContainer
      title="License vs. Usage Intelligence"
      subtitle={
        data
          ? `${data.licensed} licensed features · ${data.used} active · ${data.unused} never used (${unusedPct}%)`
          : 'Licensed features mapped against actual usage'
      }
      loading={loading}
      error={error}
      className="xl:col-span-12"
    >
      {data && (
        <div className="space-y-4">
          {/* KPI pills */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2">
              <PackageCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">{data.used} actively used</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2">
              <span className="text-sm text-amber-300 font-medium">{data.unused} never used</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2">
              <span className="text-sm text-rose-300 font-medium">{unusedPct}% wasted license</span>
            </div>
          </div>

          {/* Per-module stacked bar */}
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={28}>
                <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
                <XAxis dataKey="module" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#020617',
                    border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: 16,
                  }}
                />
                <Bar dataKey="Used"   stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Unused" stackId="a" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartContainer>
  )
}
