import { useEffect, useState } from 'react'
import { fetchRecommendations } from '../services/recommendationService.js'

export function useRecommendations(tenantId, params) {
  const [state, setState] = useState({
    recommendations: [],
    isLoading: true,
    error: '',
  })

  useEffect(() => {
    if (!tenantId) return
    setState((current) => ({ ...current, isLoading: true, error: '' }))
    fetchRecommendations(tenantId, params)
      .then((recommendations) =>
        setState({ recommendations, isLoading: false, error: '' }),
      )
      .catch((error) =>
        setState({
          recommendations: [],
          isLoading: false,
          error: error.message || 'Unable to load recommendations.',
        }),
      )
  }, [tenantId, params])

  return state
}
