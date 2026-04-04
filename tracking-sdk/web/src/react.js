import { useEffect } from 'react'
import AnalyticsTracker from './index.js'

export function useAnalyticsPageTracking({
  pathname,
  l1Domain = 'Navigation',
  l2Module = 'React Router',
  metadata = {},
}) {
  useEffect(() => {
    const featureName = AnalyticsTracker.humanizePath(pathname)
    AnalyticsTracker.startFeatureTimer(featureName)
    AnalyticsTracker.trackFeature({
      l1_domain: l1Domain,
      l2_module: l2Module,
      l3_feature: featureName,
      l4_action: 'open',
      metadata: { ...metadata, page: pathname },
    })

    return () => {
      AnalyticsTracker.trackFeature({
        l1_domain: l1Domain,
        l2_module: l2Module,
        l3_feature: featureName,
        l4_action: 'close',
        duration_ms: AnalyticsTracker.endFeatureTimer(featureName),
        metadata: { ...metadata, page: pathname },
      })
    }
  }, [pathname, l1Domain, l2Module, JSON.stringify(metadata)])
}

export default { useAnalyticsPageTracking }
