import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ChartContainer from '../ui/ChartContainer.jsx'
import { buildTrendSeries } from '../../utils/chartConfig.js'

export default function TrendLineChartCard({ data, loading, error }) {
  const chartData = buildTrendSeries(data?.bins || data)

  return (
    <ChartContainer
      title="Time Trend"
      subtitle="Feature usage and churn trend over time"
      loading={loading}
      error={error}
      className="xl:col-span-5"
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: '#020617',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 16,
              }}
            />
            <Line type="monotone" dataKey="usage" stroke="#818cf8" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="churn" stroke="#22d3ee" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  )
}
