import { sanitizeMetadata } from './sanitizer.js'
import { enqueue, dequeueBatch, requeue } from './queue.js'
import { getOrCreateSessionId, getOrCreateUserId, touchSession } from './session.js'

class AnalyticsTracker {
  constructor() {
    this.config = null
    this.featureStartTimes = new Map()
    this.flushTimer = null
    this.originalPushState = null
    this.originalReplaceState = null
    this.boundClickHandler = this.handleClick.bind(this)
    this.boundSubmitHandler = this.handleSubmit.bind(this)
    this.boundPopStateHandler = this.handleRouteMutation.bind(this)
  }

  init(config) {
    this.config = {
      endpoint: '/api/events',
      deploymentType: 'cloud',
      channel: 'web',
      autoTrack: true,
      pageResolver: (path) => path.split('/').filter(Boolean).join(' ').replace(/-/g, ' '),
      headers: {},
      ...config,
    }

    getOrCreateUserId()
    getOrCreateSessionId()

    if (this.config.autoTrack) {
      this.installAutoTracking()
      this.trackPageOpen()
    }

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.trackPageClose()
        this.flush({ useBeacon: true })
      }
    })

    window.addEventListener('online', () => this.flush())
    window.addEventListener('beforeunload', () => {
      this.trackPageClose()
      this.flush({ useBeacon: true })
    })
  }

  baseEvent(partial) {
    touchSession()
    return {
      tenant_id: this.config.tenantId,
      session_id: getOrCreateSessionId(),
      user_id: getOrCreateUserId(),
      timestamp: new Date().toISOString(),
      deployment_type: this.config.deploymentType,
      channel: this.config.channel,
      l5_deployment_node: window.location.hostname || 'client-browser',
      duration_ms: partial.duration_ms ?? null,
      success: partial.success ?? true,
      metadata: sanitizeMetadata(partial.metadata || {}),
      feedback_text: partial.feedback_text || '',
      churn_label: partial.churn_label ?? null,
      ...partial,
    }
  }

  trackFeature(event) {
    const payload = this.baseEvent(event)
    enqueue(payload)
    this.scheduleFlush()
    return payload
  }

  startFeatureTimer(featureKey) {
    this.featureStartTimes.set(featureKey, Date.now())
  }

  endFeatureTimer(featureKey) {
    const startedAt = this.featureStartTimes.get(featureKey)
    if (!startedAt) return 0
    const duration = Date.now() - startedAt
    this.featureStartTimes.delete(featureKey)
    return duration
  }

  trackPageOpen() {
    const name = this.humanizePath(window.location.pathname)
    this.startFeatureTimer(name)
    this.trackFeature({
      l1_domain: 'Navigation',
      l2_module: 'Page Views',
      l3_feature: name,
      l4_action: 'open',
      metadata: { page: window.location.pathname, title: document.title },
    })
  }

  trackPageClose() {
    const name = this.humanizePath(window.location.pathname)
    this.trackFeature({
      l1_domain: 'Navigation',
      l2_module: 'Page Views',
      l3_feature: name,
      l4_action: 'close',
      duration_ms: this.endFeatureTimer(name),
      metadata: { page: window.location.pathname, title: document.title },
    })
  }

  trackApiResult({ domain, module, feature, action = 'api_call', success, metadata }) {
    return this.trackFeature({
      l1_domain: domain,
      l2_module: module,
      l3_feature: feature,
      l4_action: action,
      success,
      metadata,
    })
  }

  trackApiSuccess({ domain, module, feature, metadata }) {
    return this.trackApiResult({
      domain,
      module,
      feature,
      action: 'api_success',
      success: true,
      metadata,
    })
  }

  trackApiFailure({ domain, module, feature, metadata }) {
    return this.trackApiResult({
      domain,
      module,
      feature,
      action: 'api_failure',
      success: false,
      metadata,
    })
  }

  createTrackedFetch({ domain = 'API', module = 'Network', featureResolver } = {}) {
    return async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || 'unknown'
      const feature =
        typeof featureResolver === 'function'
          ? featureResolver({ input, init, url })
          : this.humanizePath(new URL(url, window.location.origin).pathname)

      try {
        const response = await fetch(input, init)
        if (response.ok) {
          this.trackApiSuccess({
            domain,
            module,
            feature,
            metadata: { url, method: init.method || 'GET', status: response.status },
          })
        } else {
          this.trackApiFailure({
            domain,
            module,
            feature,
            metadata: { url, method: init.method || 'GET', status: response.status },
          })
        }
        return response
      } catch (error) {
        this.trackApiFailure({
          domain,
          module,
          feature,
          metadata: { url, method: init.method || 'GET', error: error?.message || 'network_error' },
        })
        throw error
      }
    }
  }

  installAutoTracking() {
    document.addEventListener('click', this.boundClickHandler, true)
    document.addEventListener('submit', this.boundSubmitHandler, true)

    this.originalPushState = history.pushState
    history.pushState = (...args) => {
      this.handleRouteMutation()
      this.originalPushState.apply(history, args)
      this.trackPageOpen()
    }

    this.originalReplaceState = history.replaceState
    history.replaceState = (...args) => {
      this.handleRouteMutation()
      this.originalReplaceState.apply(history, args)
      this.trackPageOpen()
    }

    window.addEventListener('popstate', this.boundPopStateHandler)
  }

  handleRouteMutation() {
    this.trackPageClose()
  }

  handleClick(event) {
    const target = event.target.closest('button, a, [role="button"]')
    if (!target) return
    const label = (target.innerText || target.getAttribute('aria-label') || target.id || 'click').trim()
    this.trackFeature({
      l1_domain: 'UI Interactions',
      l2_module: 'Buttons',
      l3_feature: label,
      l4_action: 'click',
      metadata: {
        page: window.location.pathname,
        element_id: target.id || null,
      },
    })
  }

  handleSubmit(event) {
    const form = event.target
    if (!form) return
    this.trackFeature({
      l1_domain: 'UI Interactions',
      l2_module: 'Forms',
      l3_feature: form.getAttribute('name') || form.id || 'Form Submission',
      l4_action: 'submit',
      metadata: { page: window.location.pathname },
    })
  }

  humanizePath(pathname) {
    const resolved = this.config.pageResolver(pathname || '/')
    const cleaned = String(resolved || 'Home').trim()
    if (!cleaned) return 'Home'
    return cleaned
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  scheduleFlush() {
    clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flush(), 1500)
  }

  async flush({ useBeacon = false } = {}) {
    const batch = dequeueBatch(25)
    if (!batch.length) return

    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(this.config.endpoint, new Blob([JSON.stringify(batch)], { type: 'application/json' }))
        return
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.config.headers },
        body: JSON.stringify(batch),
        keepalive: true,
      })

      if (!response.ok) throw new Error(`flush failed: ${response.status}`)
    } catch {
      requeue(batch)
    }
  }

  destroy() {
    document.removeEventListener('click', this.boundClickHandler, true)
    document.removeEventListener('submit', this.boundSubmitHandler, true)
    window.removeEventListener('popstate', this.boundPopStateHandler)

    if (this.originalPushState) {
      history.pushState = this.originalPushState
      this.originalPushState = null
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState
      this.originalReplaceState = null
    }

    clearTimeout(this.flushTimer)
  }
}

export default new AnalyticsTracker()
