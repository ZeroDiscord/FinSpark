const axios = require('axios');

class FinsparkInterceptor {
  constructor(tenantId, options = {}) {
    this.tenantId = tenantId;
    this.endpoint = options.endpoint || 'http://localhost:5000/api/track';
    this.buffer = [];
    this.bufferSize = options.bufferSize || 10;
  }

  track(eventData) {
    this.buffer.push({
      tenant_id: this.tenantId,
      timestamp: eventData.timestamp || new Date().toISOString(),
      channel: eventData.channel || 'api',
      l3_feature: eventData.l3_feature || 'unknown_feature',
      session_id: eventData.session_id || 'backend-sys',
      user_id: eventData.user_id,
      success: eventData.success !== false,
      duration_ms: eventData.duration_ms || 0
    });

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const batch = [...this.buffer];
    this.buffer = [];
    
    try {
      await axios.post(`${this.endpoint}/bulk`, { events: batch });
    } catch (err) {
      // Intentionally swallow errors so tracing doesn't crash the host app
    }
  }

  /**
   * Express Middleware to automatically track API routes
   */
  expressMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime();
      
      // Monkey patch finish to capture response time
      res.on('finish', () => {
        const diff = process.hrtime(start);
        const durationMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
        
        const featureName = `${req.method} ${req.route ? req.route.path : req.path}`;
        
        this.track({
          channel: 'api',
          l3_feature: featureName,
          session_id: req.headers['x-session-id'] || 'api_session',
          duration_ms: durationMs,
          success: res.statusCode < 400
        });
      });
      
      next();
    };
  }
}

module.exports = FinsparkInterceptor;
