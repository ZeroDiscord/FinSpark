import { Activity, BarChart3, Flame, Users } from 'lucide-react'
import StatsCard from '../ui/StatsCard.jsx'
import { formatNumber, formatPercent } from '../../utils/formatters.js'

export default function OverviewStatsRow({ overview, featureCount = 0 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Total Sessions"
        value={formatNumber(overview?.n_sessions)}
        delta="Tracked across active workspaces"
        icon={Activity}
      />
      <StatsCard
        title="Active Users"
        value={formatNumber(overview?.n_users || overview?.active_users || overview?.n_sessions)}
        delta="Users seen in current range"
        icon={Users}
      />
      <StatsCard
        title="Features Used"
        value={formatNumber(featureCount)}
        delta="Mapped and activated"
        icon={BarChart3}
      />
      <StatsCard
        title="Churn Rate"
        value={formatPercent(overview?.churn_rate)}
        delta="Users at elevated risk"
        trend="down"
        icon={Flame}
      />
    </div>
  )
}
