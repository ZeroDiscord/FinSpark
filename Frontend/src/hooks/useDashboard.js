import { useState, useEffect, useCallback } from 'react'
import {
  getOverview, getFeatureUsage, getDashFriction,
  getChurnDistribution, getFunnel, getSegmentation
} from '../api/dashboard.api.js'

export default function useDashboard(tenantId) {
  const [data, setData] = useState({
    overview: null, usage: [], friction: [], churnDist: null, funnel: [], segmentation: null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!tenantId) return
    setLoading(true); setError(null)
    try {
      const [ov, us, fr, cd, fn, sg] = await Promise.allSettled([
        getOverview(tenantId), getFeatureUsage(tenantId), getDashFriction(tenantId),
        getChurnDistribution(tenantId), getFunnel(tenantId), getSegmentation(tenantId),
      ])
      setData({
        overview:     ov.status === 'fulfilled' ? ov.value : null,
        usage:        us.status === 'fulfilled' && Array.isArray(us.value) ? us.value : [],
        friction:     fr.status === 'fulfilled' && Array.isArray(fr.value) ? fr.value : [],
        churnDist:    cd.status === 'fulfilled' ? cd.value : null,
        funnel:       fn.status === 'fulfilled' && Array.isArray(fn.value) ? fn.value : [],
        segmentation: sg.status === 'fulfilled' ? sg.value : null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { fetch() }, [fetch])

  return { ...data, loading, error, refetch: fetch }
}
