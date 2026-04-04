import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import ChartContainer from '../ui/ChartContainer.jsx'
import { buildPieSeries } from '../../utils/chartConfig.js'

export default function FeatureUsagePieChartCard({ data, loading, error }) {
  const chartData = buildPieSeries(data)

  return (
    <ChartContainer
      title="Feature Mix"
      subtitle="Distribution of activity by module"
      loading={loading}
      error={error}
      className="xl:col-span-3"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={4}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#020617',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 16,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2 text-xs text-slate-400">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.fill }} />
              {entry.name}
            </div>
            <span>{entry.value}</span>
          </div>
        ))}
      </div>
    </ChartContainer>
  )
}
