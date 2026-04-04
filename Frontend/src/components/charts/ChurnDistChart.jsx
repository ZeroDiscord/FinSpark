import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass" style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}>
      <div style={{ marginBottom: 4 }}>Prob bin: <b>{label}</b></div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  )
}

export default function ChurnDistChart({ data }) {
  if (!data?.bins) {
    return <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>No distribution data</div>
  }

  const chartData = data.bins.map((bin, i) => ({
    bin: bin.toFixed(2),
    Retained: data.complete_counts?.[i] ?? 0,
    Churned: data.churn_counts?.[i] ?? 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="bin" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} label={{ value: 'Churn Probability', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }} />
        <Area type="monotone" dataKey="Retained" stroke="#6c63ff" fill="rgba(108,99,255,0.25)" strokeWidth={2} />
        <Area type="monotone" dataKey="Churned"  stroke="#ff5c5c" fill="rgba(255,92,92,0.2)"  strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
