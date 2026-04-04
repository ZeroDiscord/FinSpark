import ChartContainer from '../ui/ChartContainer.jsx'
import { buildHeatmapData } from '../../utils/chartConfig.js'

export default function ChurnHeatmapCard({ data, loading, error }) {
  const rows = buildHeatmapData(data)
  const columns = ['web', 'mobile', 'assisted']

  return (
    <ChartContainer
      title="Churn Heatmap"
      subtitle="Risk concentration by feature and deployment context"
      loading={loading}
      error={error}
      className="xl:col-span-5"
    >
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.feature} className="grid grid-cols-[160px_repeat(3,minmax(0,1fr))] gap-3 text-sm">
            <div className="truncate text-slate-300">{row.feature}</div>
            {columns.map((column) => (
              <div key={column} className="rounded-2xl bg-white/5 p-2">
                <div
                  className="rounded-xl px-3 py-3 text-center text-xs font-medium text-white"
                  style={{
                    background: `rgba(${column === 'web' ? '129,140,248' : column === 'mobile' ? '34,211,238' : '244,114,182'}, ${Math.max(
                      0.18,
                      row[column] / 100,
                    )})`,
                  }}
                >
                  {row[column]}%
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ChartContainer>
  )
}
