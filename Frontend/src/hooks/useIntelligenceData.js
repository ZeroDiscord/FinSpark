import { useCallback, useEffect, useState } from 'react'
import {
  getChurnDistribution,
  getFeatureUsage,
  getFriction,
  getFunnelEdges,
  getFunnelSummary,
  getKpis,
  getOverview,
  getSegmentation,
  getSessions,
  getTimeInsights,
} from '../api/intelligence.api.js'

const INITIAL_STATE = {
  kpis: null,
  overview: null,
  funnelEdges: [],
  funnel: null,
  churnDist: null,
  friction: [],
  featureUsage: [],
  sessions: [],

  segmentation: null,
  timeInsights: null,
  isLoading: true,
  error: null,
}

function asRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function asFunnelEdges(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.edges)) return payload.edges
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

export function useIntelligenceData(tenantId) {
  const [state, setState] = useState(INITIAL_STATE)

  const reload = useCallback(() => {
    if (!tenantId) return
    setState((s) => ({ ...s, isLoading: true, error: null }))

    Promise.allSettled([
      getKpis(tenantId),
      getOverview(tenantId),
      getFunnelEdges(tenantId),
      getFunnelSummary(tenantId),
      getChurnDistribution(tenantId),
      getFriction(tenantId),
      getFeatureUsage(tenantId),
      getSessions(tenantId),
      getSegmentation(tenantId),
      getTimeInsights(tenantId),
    ]).then(([kpis, overview, funnelEdges, funnel, churnDist, friction, featureUsage, sessions, segmentation, timeInsights]) => {
      const allFailed = [kpis, overview, funnelEdges, funnel].every((r) => r.status === 'rejected')
      const firstError = [kpis, overview, funnelEdges, funnel, churnDist, friction, featureUsage, sessions, timeInsights].find(
        (r) => r.status === 'rejected'
      )?.reason

      const overviewValue = overview.status === 'fulfilled' ? overview.value : null
      const kpisValue = kpis.status === 'fulfilled'
        ? kpis.value
        : overviewValue
          ? {
              total_sessions: overviewValue.n_sessions ?? 0,
              churn_rate: overviewValue.churn_rate ?? 0,
              avg_session_duration_ms: overviewValue.avg_session_duration_ms ?? null,
            }
          : null

      setState({
        kpis: kpisValue,
        overview: overviewValue,
        funnelEdges: funnelEdges.status === 'fulfilled' ? asFunnelEdges(funnelEdges.value) : [],
        funnel: funnel.status === 'fulfilled' ? funnel.value : null,
        churnDist: churnDist.status === 'fulfilled' ? churnDist.value : null,
        friction: friction.status === 'fulfilled' ? friction.value : [],
        featureUsage: featureUsage.status === 'fulfilled' ? asRows(featureUsage.value) : [],
        sessions: sessions.status === 'fulfilled' ? sessions.value : [],

        segmentation: segmentation.status === 'fulfilled' ? segmentation.value : null,
        timeInsights: timeInsights.status === 'fulfilled' ? timeInsights.value : null,
        isLoading: false,
        error: allFailed
          ? firstError?.response?.data?.error || firstError?.message || 'Unable to load intelligence data.'
          : null,
      })
    })
  }, [tenantId])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload }
}
