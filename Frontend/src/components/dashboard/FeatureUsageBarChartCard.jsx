import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ChartContainer from '../ui/ChartContainer.jsx'

export default function FeatureUsageBarChartCard({ data, loading, error }) {
  const chartData = (data || []).slice(0, 8).map((item, index) => ({
    name: item.feature || item.name || item.l3_feature || `Feature ${index + 1}`,
    usage: Number(item.usage_count || item.count || item.sessions || 0),
  }))

  return (
    <ChartContainer
      title="Feature Usage"
      subtitle="Most engaged capabilities across the selected tenant"
      loading={loading}
      error={error}
      className="xl:col-span-7"
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: '#020617',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 16,
              }}
            />
            <Bar dataKey="usage" fill="url(#featureGradient)" radius={[10, 10, 0, 0]} />
            <defs>
              <linearGradient id="featureGradient" x1="0" x2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  )
}
