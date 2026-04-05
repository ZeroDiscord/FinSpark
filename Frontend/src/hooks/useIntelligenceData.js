import { useCallback, useEffect, useState } from 'react'
import {
  getChurnDistribution,
  getFeatureUsage,
  getFriction,
  getFunnelEdges,
  getOverview,
  getSegmentation,
  getSessions,
  getTransitionMatrix,
} from '../api/intelligence.api.js'

const INITIAL_STATE = {
  overview: null,
  funnelEdges: [],
  churnDist: null,
  friction: [],
  featureUsage: [],
  sessions: [],
  transitionMatrix: null,
  segmentation: null,
  isLoading: true,
  error: null,
}

export function useIntelligenceData(tenantId) {
  const [state, setState] = useState(INITIAL_STATE)

  const reload = useCallback(() => {
    if (!tenantId) return
    setState((s) => ({ ...s, isLoading: true, error: null }))

    Promise.allSettled([
      getOverview(tenantId),
      getFunnelEdges(tenantId),
      getChurnDistribution(tenantId),
      getFriction(tenantId),
      getFeatureUsage(tenantId),
      getSessions(tenantId, 8),
      getTransitionMatrix(tenantId),
      getSegmentation(tenantId),
    ]).then(([overview, funnelEdges, churnDist, friction, featureUsage, sessions, transitionMatrix, segmentation]) => {
      const allFailed = [overview, funnelEdges].every((r) => r.status === 'rejected')
      const firstError = [overview, funnelEdges, churnDist, friction, featureUsage, sessions, transitionMatrix].find(
        (r) => r.status === 'rejected'
      )?.reason

      setState({
        overview: overview.status === 'fulfilled' ? overview.value : null,
        funnelEdges: funnelEdges.status === 'fulfilled' ? funnelEdges.value : [],
        churnDist: churnDist.status === 'fulfilled' ? churnDist.value : null,
        friction: friction.status === 'fulfilled' ? friction.value : [],
        featureUsage: featureUsage.status === 'fulfilled' ? featureUsage.value : [],
        sessions: sessions.status === 'fulfilled' ? sessions.value : [],
        transitionMatrix: transitionMatrix.status === 'fulfilled' ? transitionMatrix.value : null,
        segmentation: segmentation.status === 'fulfilled' ? segmentation.value : null,
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
