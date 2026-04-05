import { useParams } from 'react-router-dom'
import ChurnHeatmapCard from '../components/dashboard/ChurnHeatmapCard.jsx'
import FeatureUsageBarChartCard from '../components/dashboard/FeatureUsageBarChartCard.jsx'
import FeatureUsagePieChartCard from '../components/dashboard/FeatureUsagePieChartCard.jsx'
import OverviewStatsRow from '../components/dashboard/OverviewStatsRow.jsx'
import TopDropoffTable from '../components/dashboard/TopDropoffTable.jsx'
import TrendLineChartCard from '../components/dashboard/TrendLineChartCard.jsx'
import UserFunnelCard from '../components/dashboard/UserFunnelCard.jsx'
import FilterBar from '../components/ui/FilterBar.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useDashboardData } from '../hooks/useDashboardData.js'
import { useDashboardFilters } from '../hooks/useDashboardFilters.js'

const filterOptions = [
  {
    key: 'dateRange',
    label: 'Date range',
    items: [
      { value: '7d', label: 'Last 7 days' },
      { value: '30d', label: 'Last 30 days' },
      { value: '90d', label: 'Last 90 days' },
    ],
  },
  {
    key: 'deploymentType',
    label: 'Deployment',
    items: [
      { value: 'all', label: 'All deployments' },
      { value: 'cloud', label: 'Cloud' },
      { value: 'onprem', label: 'On-prem' },
    ],
  },
  {
    key: 'channel',
    label: 'Channel',
    items: [
      { value: 'all', label: 'All channels' },
      { value: 'web', label: 'Web' },
      { value: 'android', label: 'Android' },
      { value: 'assisted', label: 'Assisted' },
    ],
  },
  {
    key: 'tenant',
    label: 'Tenant scope',
    items: [{ value: 'current', label: 'Current workspace' }],
  },
]

export default function DashboardPage() {
  const { tenantId } = useParams()
  const { filters, setFilter, resetFilters } = useDashboardFilters()
  const { overview, featureUsage, churn, funnel, trend, dropoffRows, isLoading, error } =
    useDashboardData(tenantId, filters)

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Analytics dashboard"
        title="Enterprise product intelligence"
        description="Monitor usage, churn concentration, journey friction, and module adoption with filters for date range, deployment type, and channel."
      />
      <OverviewStatsRow overview={overview} featureCount={featureUsage?.length} />
      <FilterBar filters={filters} options={filterOptions} onChange={setFilter} onReset={resetFilters} />
      {error ? (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-12">
        <FeatureUsageBarChartCard data={featureUsage} loading={isLoading} error={error} />
        <ChurnHeatmapCard data={churn} loading={isLoading} error={error} />
        <UserFunnelCard data={funnel?.steps} loading={isLoading} error={error} />
        <TrendLineChartCard data={trend} loading={isLoading} error={error} />
        <FeatureUsagePieChartCard data={featureUsage} loading={isLoading} error={error} />
        <TopDropoffTable rows={dropoffRows} loading={isLoading} error={error} />
      </div>
    </div>
  )
}
