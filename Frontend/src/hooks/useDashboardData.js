import { useEffect, useState } from 'react'
import {
  fetchChurnHeatmap,
  fetchDashboardOverview,
  fetchDropoffTable,
  fetchFeatureUsage,
  fetchFunnel,
  fetchJourneys,
  fetchTrendSeries,
} from '../services/dashboardService.js'

export function useDashboardData(tenantId, filters) {
  const [state, setState] = useState({
    overview: null,
    featureUsage: [],
    churn: null,
    funnel: null,
    journeys: null,
    trend: null,
    dropoffRows: [],
    isLoading: true,
    error: '',
  })

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setState((current) => ({ ...current, isLoading: true, error: '' }))

    Promise.allSettled([
      fetchDashboardOverview(tenantId, filters),
      fetchFeatureUsage(tenantId, filters),
      fetchChurnHeatmap(tenantId, filters),
      fetchFunnel(tenantId, filters),
      fetchTrendSeries(tenantId, filters),
      fetchDropoffTable(tenantId, filters),
      fetchJourneys(tenantId, filters),
    ]).then(([overview, featureUsage, churn, funnel, trend, dropoffRows, journeys]) => {
      if (cancelled) return
      const allFailed = [overview, featureUsage].every((r) => r.status === 'rejected')
      const firstError = [overview, featureUsage, churn, funnel, trend, dropoffRows, journeys]
        .find((r) => r.status === 'rejected')
        ?.reason
      const errorMsg = allFailed
        ? (firstError?.response?.data?.error || firstError?.message || 'Unable to load dashboard data.')
        : ''

      setState({
        overview: overview.status === 'fulfilled' ? overview.value : null,
        featureUsage: featureUsage.status === 'fulfilled' ? featureUsage.value : [],
        churn: churn.status === 'fulfilled' ? churn.value : null,
        funnel: funnel.status === 'fulfilled' ? funnel.value : null,
        journeys: journeys.status === 'fulfilled' ? journeys.value : null,
        trend: trend.status === 'fulfilled' ? trend.value : null,
        dropoffRows: dropoffRows.status === 'fulfilled' ? dropoffRows.value : [],
        isLoading: false,
        error: errorMsg,
      })
    })

    return () => {
      cancelled = true
    }
  }, [tenantId, filters])

  return state
}
