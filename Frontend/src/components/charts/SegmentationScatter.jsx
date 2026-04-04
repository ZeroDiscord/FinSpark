import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="glass" style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}>
      <div>Churn probability: <b>{((d?.churn_prob || 0) * 100).toFixed(1)}%</b></div>
      <div>Segment: <b>{d?.label === 1 ? 'Churned' : 'Retained'}</b></div>
    </div>
  )
}

export default function SegmentationScatter({ data }) {
  if (!data?.points?.length) {
    return <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>No segmentation data</div>
  }

  const retained = data.points.filter(p => p.label === 0)
  const churned  = data.points.filter(p => p.label === 1)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="x" type="number" name="Component 1" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
        <YAxis dataKey="y" type="number" name="Component 2" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
        <Scatter name="Retained" data={retained} fill="rgba(76,175,130,0.65)" />
        <Scatter name="Churned"  data={churned}  fill="rgba(255,92,92,0.65)"  />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
