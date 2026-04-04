import { useEffect, useState } from 'react'
import {
  fetchChurnHeatmap,
  fetchDashboardOverview,
  fetchDropoffTable,
  fetchFeatureUsage,
  fetchFunnel,
  fetchTrendSeries,
} from '../services/dashboardService.js'

export function useDashboardData(tenantId, filters) {
  const [state, setState] = useState({
    overview: null,
    featureUsage: [],
    heatmap: [],
    funnel: [],
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
      fetchDashboardOverview(tenantId),
      fetchFeatureUsage(tenantId),
      fetchChurnHeatmap(tenantId),
      fetchFunnel(tenantId),
      fetchTrendSeries(tenantId),
      fetchDropoffTable(tenantId),
    ]).then(([overview, featureUsage, heatmap, funnel, trend, dropoffRows]) => {
      if (cancelled) return
      setState({
        overview: overview.status === 'fulfilled' ? overview.value : null,
        featureUsage: featureUsage.status === 'fulfilled' ? featureUsage.value : [],
        heatmap: heatmap.status === 'fulfilled' ? heatmap.value : [],
        funnel: funnel.status === 'fulfilled' ? funnel.value : [],
        trend: trend.status === 'fulfilled' ? trend.value : null,
        dropoffRows: dropoffRows.status === 'fulfilled' ? dropoffRows.value : [],
        isLoading: false,
        error:
          overview.status === 'rejected' && featureUsage.status === 'rejected'
            ? 'Unable to load dashboard data.'
            : '',
      })
    })

    return () => {
      cancelled = true
    }
  }, [tenantId, filters])

  return state
}
