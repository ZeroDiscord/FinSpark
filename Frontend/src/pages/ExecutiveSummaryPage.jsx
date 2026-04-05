import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  Flame,
  PackageCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useDashboardData } from '../hooks/useDashboardData.js'
import client from '../api/client.js'
import { formatNumber, formatPercent } from '../utils/formatters.js'

function RiskBadge({ level }) {
  const map = {
    critical: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
    high:     'border-amber-400/30 bg-amber-500/10 text-amber-300',
    medium:   'border-yellow-400/30 bg-yellow-500/10 text-yellow-300',
    low:      'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  }
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[level] || map.medium}`}>
      {level}
    </span>
  )
}

function MetricPill({ icon: Icon, label, value, trend }) {
  const trendColor = trend === 'bad' ? 'text-rose-300' : trend === 'good' ? 'text-emerald-300' : 'text-slate-300'
  const TrendIcon  = trend === 'bad' ? TrendingDown : TrendingUp
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`text-2xl font-semibold ${trendColor}`}>{value}</div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {trend === 'bad' ? 'Needs attention' : 'On track'}
        </div>
      )}
    </div>
  )
}

export default function ExecutiveSummaryPage() {
  const { tenantId } = useParams()
  const { overview, featureUsage, churn, funnel, isLoading } = useDashboardData(tenantId, {})
  const [licenseData, setLicenseData] = useState(null)
  const [recommendations, setRecommendations] = useState([])

  useEffect(() => {
    if (!tenantId) return
    client.get(`/dashboard/${tenantId}/license-usage`).then((r) => setLicenseData(r.data)).catch(() => null)
    client.get('/recommendations', { params: { tenant_id: tenantId, status: 'open' } })
      .then((r) => setRecommendations(Array.isArray(r.data) ? r.data : r.data?.recommendations || []))
      .catch(() => null)
  }, [tenantId])

  // Top 3 features at risk (highest churn rate)
  const atRiskFeatures = (churn?.churn_by_feature || []).slice(0, 3)

  // Funnel biggest drop-off
  const biggestDrop = funnel?.biggest_drop_off_step

  // License waste
  const unusedPct = licenseData?.unused_pct ?? 0
  const unusedCount = licenseData?.unused ?? 0

  // Critical recommendations
  const criticalRecs = recommendations.filter((r) => r.priority === 'critical' || r.priority === 'high').slice(0, 3)

  // Renewal risk: avg churn rate across churned sessions
  const churnRate = overview?.churn_rate ?? 0
  const renewalRisk = churnRate > 0.5 ? 'High' : churnRate > 0.25 ? 'Medium' : 'Low'
  const renewalRiskLevel = churnRate > 0.5 ? 'critical' : churnRate > 0.25 ? 'high' : 'low'

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Strategic Intelligence"
        title="Executive Summary"
        description="Real-time strategic snapshot of product adoption, churn risk, license ROI, and recommended actions for leadership review."
      />

      {/* Top KPI row */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricPill
          icon={BarChart3}
          label="Total Sessions"
          value={formatNumber(overview?.total_sessions || 0)}
        />
        <MetricPill
          icon={Flame}
          label="Overall Churn Rate"
          value={formatPercent(churnRate)}
          trend={churnRate > 0.3 ? 'bad' : 'good'}
        />
        <MetricPill
          icon={PackageCheck}
          label="Unused Licensed Features"
          value={`${unusedCount} (${unusedPct}%)`}
          trend={unusedPct > 30 ? 'bad' : 'good'}
        />
        <MetricPill
          icon={Sparkles}
          label="Open Recommendations"
          value={recommendations.length}
          trend={recommendations.length > 5 ? 'bad' : 'good'}
        />
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Features at risk */}
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-rose-400" />
              <div className="text-lg font-semibold text-white">Top Features at Risk</div>
            </div>
            <p className="text-xs text-slate-400">Features with the highest churn concentration — prioritize UX improvements here.</p>
            {isLoading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : atRiskFeatures.length === 0 ? (
              <div className="text-sm text-slate-500">No churn data yet.</div>
            ) : (
              <div className="space-y-2">
                {atRiskFeatures.map((f) => (
                  <div key={f.feature} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">{f.feature}</div>
                      <div className="text-xs text-slate-400">{f.session_count} sessions</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-rose-300">{formatPercent(f.churn_rate)} churn</div>
                      <RiskBadge level={f.churn_rate > 0.6 ? 'critical' : f.churn_rate > 0.35 ? 'high' : 'medium'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Renewal risk + journey drop-off */}
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-400" />
              <div className="text-lg font-semibold text-white">Renewal & Journey Risk</div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">Predicted Renewal Risk</div>
                  <div className="text-xs text-slate-400">Based on overall churn probability</div>
                </div>
                <RiskBadge level={renewalRiskLevel} />
              </div>
              {biggestDrop && (
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-white">Biggest Journey Drop-off</div>
                    <div className="text-xs text-slate-400">Step with highest user abandonment</div>
                  </div>
                  <div className="text-sm font-semibold text-amber-300">{biggestDrop}</div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">License Utilisation</div>
                  <div className="text-xs text-slate-400">Features licensed but never invoked</div>
                </div>
                <div className="text-sm font-semibold text-amber-300">{unusedCount} unused</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Critical recommended actions */}
        <Card className="xl:col-span-2">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <div className="text-lg font-semibold text-white">Top Recommended Actions</div>
            </div>
            <p className="text-xs text-slate-400">Data-driven product strategy actions ranked by business impact.</p>
            {criticalRecs.length === 0 ? (
              <div className="text-sm text-slate-500">No high-priority recommendations at this time.</div>
            ) : (
              <div className="space-y-2">
                {criticalRecs.map((rec) => (
                  <div key={rec._id || rec.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-white">{rec.title || rec.message || 'Recommendation'}</div>
                      {rec.description && <div className="text-xs text-slate-400">{rec.description}</div>}
                      {rec.feature && <div className="text-xs text-slate-500">Feature: {rec.feature}</div>}
                    </div>
                    <RiskBadge level={rec.priority} />
                  </div>
                ))}
              </div>
            )}
            {recommendations.length > 3 && (
              <div className="text-xs text-slate-500">+{recommendations.length - 3} more in Recommendations center</div>
            )}
          </CardContent>
        </Card>

        {/* Deployment split summary */}
        {licenseData && (
          <Card className="xl:col-span-2">
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-violet-400" />
                <div className="text-lg font-semibold text-white">License ROI by Module</div>
              </div>
              <p className="text-xs text-slate-400">
                {licenseData.licensed} total licensed features · {licenseData.used} in active use · {licenseData.unused} inactive ({licenseData.unused_pct}% wasted spend)
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {(licenseData.by_module || []).map((row) => {
                  const pct = row.licensed ? Math.round((row.used / row.licensed) * 100) : 0
                  return (
                    <div key={row.module} className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
                      <div className="text-xs font-medium text-slate-300 truncate">{row.module}</div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-700">
                        <div
                          className="h-1.5 rounded-full bg-cyan-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{row.used}/{row.licensed} used</div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
