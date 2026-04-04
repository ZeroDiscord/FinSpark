import ChartContainer from '../ui/ChartContainer.jsx'

export default function UserFunnelCard({ data, loading, error }) {
  const steps = (data || []).slice(0, 5).map((item, index) => ({
    label: item.feature || item.step || item.l3_feature || `Step ${index + 1}`,
    value: Number(item.count || item.sessions || item.users || 0),
    dropOff: Number(item.drop_off_percentage || 0),
  }))

  const peak = Math.max(...steps.map((step) => step.value), 1)

  return (
    <ChartContainer
      title="User Funnel"
      subtitle="Stage-by-stage conversion through the core journey"
      loading={loading}
      error={error}
      className="xl:col-span-4"
    >
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{step.label}</span>
              <span className="text-slate-500">{step.value}</span>
            </div>
            <div className="h-3 rounded-full bg-white/5">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                style={{ width: `${Math.max(18, (step.value / peak) * 100)}%` }}
              />
            </div>
            {index < steps.length - 1 ? (
              <div className="text-xs text-slate-500">
                Drop to next step: {Math.max(0, Math.round(step.dropOff || 0))}%
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ChartContainer>
  )
}
