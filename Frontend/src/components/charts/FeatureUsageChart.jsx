import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div>Usage: <b>{payload[0]?.value}</b></div>
      {payload[1] && <div>Churn: <b>{(payload[1].value * 100).toFixed(1)}%</b></div>}
    </div>
  )
}

export default function FeatureUsageChart({ data = [] }) {
  const sorted = [...data].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 15)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={sorted} margin={{ top: 5, right: 10, left: -20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="feature"
          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="usage_count" radius={[4, 4, 0, 0]} maxBarSize={30}>
          {sorted.map((entry, i) => {
            const churn = entry.churn_rate || 0
            const r = Math.round(108 + churn * 147)
            const g = Math.round(99 - churn * 99)
            const b = Math.round(255 - churn * 200)
            return <Cell key={i} fill={`rgba(${r},${g},${b},0.8)`} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
