import ChartContainer from '../ui/ChartContainer.jsx'
import { buildDropoffRows } from '../../utils/chartConfig.js'
import { formatPercent } from '../../utils/formatters.js'

export default function TopDropoffTable({ rows, onFeatureClick, loading, error }) {
  const tableRows = buildDropoffRows(rows)

  return (
    <ChartContainer
      title="Top Drop-off Features"
      subtitle="The biggest friction points driving abandonment"
      loading={loading}
      error={error}
      className="xl:col-span-12"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="border-b border-white/10 text-slate-500">
              <th className="px-3 py-3">Feature</th>
              <th className="px-3 py-3">Drop-off</th>
              <th className="px-3 py-3">Impacted users</th>
              <th className="px-3 py-3">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="px-3 py-4">
                  <button onClick={() => onFeatureClick?.(row)} className="font-medium text-white">
                    {row.feature}
                  </button>
                </td>
                <td className="px-3 py-4 text-rose-300">{formatPercent(row.dropoffRate)}</td>
                <td className="px-3 py-4">{row.impactedUsers}</td>
                <td className="px-3 py-4 text-slate-400">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartContainer>
  )
}
