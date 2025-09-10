const createLogger = require('./logging');

/**
 * HTTP metrics collector for observability
 */
class HttpMetrics {
  constructor() {
    this.metrics = {
      requests: new Map(), // Total requests by host/status
      rateLimits: new Map(), // Rate limit events by host
      retries: new Map(), // Retry events by host/reason
      circuitBreaker: new Map(), // Circuit breaker events by host/state
      responseTime: new Map(), // Response times by host
      errors: new Map() // Error counts by host/type
    };
    this.logger = createLogger().child({ component: 'http-metrics' });
  }

  /**
   * Record HTTP request metrics
   */
  recordRequest(host, statusCode, responseTimeMs, correlationId) {
    const key = `${host}:${Math.floor(statusCode / 100)}xx`;
    this.incrementCounter('requests', key);
    
    if (!this.metrics.responseTime.has(host)) {
      this.metrics.responseTime.set(host, []);
    }
    
    this.metrics.responseTime.get(host).push({
      timestamp: Date.now(),
      value: responseTimeMs,
      correlationId
    });

    // Keep only recent entries (last hour)
    this.cleanupMetrics('responseTime', host);

    this.logger.debug({
      host,
      statusCode,
      responseTimeMs,
      correlationId
    }, 'HTTP request completed');
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(host, waitTimeMs, correlationId) {
    this.incrementCounter('rateLimits', `${host}:hit`);
    
    this.logger.info({
      host,
      waitTimeMs,
      correlationId,
      event: 'rate_limit.hit'
    }, 'Rate limit hit');
  }

  /**
   * Record 429 deferral
   */
  record429Deferred(host, retryAfterMs, correlationId) {
    this.incrementCounter('rateLimits', `${host}:429_deferred`);
    
    this.logger.info({
      host,
      retryAfterMs,
      correlationId,
      event: '429.deferred'
    }, 'Request deferred due to 429');
  }

  /**
   * Record retry scheduling
   */
  recordRetryScheduled(host, reason, delayMs, attempt, correlationId) {
    this.incrementCounter('retries', `${host}:${reason}`);
    
    this.logger.info({
      host,
      reason,
      delayMs,
      attempt,
      correlationId,
      event: 'retry.scheduled'
    }, 'Retry scheduled');
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitStateChange(host, oldState, newState, correlationId) {
    this.incrementCounter('circuitBreaker', `${host}:${newState}`);
    
    this.logger.warn({
      host,
      oldState,
      newState,
      correlationId,
      event: `circuit.${newState}`
    }, 'Circuit breaker state changed');
  }

  /**
   * Record error
   */
  recordError(host, errorType, errorMessage, correlationId) {
    this.incrementCounter('errors', `${host}:${errorType}`);
    
    this.logger.error({
      host,
      errorType,
      errorMessage,
      correlationId,
      event: 'http.error'
    }, 'HTTP error occurred');
  }

  /**
   * Increment counter metric
   */
  incrementCounter(metricType, key, value = 1) {
    if (!this.metrics[metricType].has(key)) {
      this.metrics[metricType].set(key, []);
    }
    
    this.metrics[metricType].get(key).push({
      timestamp: Date.now(),
      value
    });

    // Keep only recent entries
    this.cleanupMetrics(metricType, key);
  }

  /**
   * Clean up old metric entries (keep last hour)
   */
  cleanupMetrics(metricType, key) {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    const entries = this.metrics[metricType].get(key);
    if (entries) {
      this.metrics[metricType].set(key, 
        entries.filter(entry => entry.timestamp > cutoff)
      );
    }
  }

  /**
   * Get metrics summary for host
   */
  getHostMetrics(host) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const fiveMin = 5 * 60 * 1000;
    
    const summary = {
      host,
      timestamp: now,
      requests: {},
      rateLimits: {},
      retries: {},
      circuitBreaker: {},
      responseTime: {},
      errors: {}
    };

    // Aggregate request counts by status class
    for (const [key, entries] of this.metrics.requests.entries()) {
      if (key.startsWith(host + ':')) {
        const statusClass = key.split(':')[1];
        const recent = entries.filter(e => now - e.timestamp < oneHour);
        const veryRecent = entries.filter(e => now - e.timestamp < fiveMin);
        
        summary.requests[statusClass] = {
          total: recent.reduce((sum, e) => sum + e.value, 0),
          last5min: veryRecent.reduce((sum, e) => sum + e.value, 0)
        };
      }
    }

    // Aggregate rate limit metrics
    for (const [key, entries] of this.metrics.rateLimits.entries()) {
      if (key.startsWith(host + ':')) {
        const eventType = key.split(':')[1];
        const recent = entries.filter(e => now - e.timestamp < oneHour);
        summary.rateLimits[eventType] = recent.reduce((sum, e) => sum + e.value, 0);
      }
    }

    // Aggregate retry metrics
    for (const [key, entries] of this.metrics.retries.entries()) {
      if (key.startsWith(host + ':')) {
        const reason = key.split(':')[1];
        const recent = entries.filter(e => now - e.timestamp < oneHour);
        summary.retries[reason] = recent.reduce((sum, e) => sum + e.value, 0);
      }
    }

    // Aggregate circuit breaker metrics
    for (const [key, entries] of this.metrics.circuitBreaker.entries()) {
      if (key.startsWith(host + ':')) {
        const state = key.split(':')[1];
        const recent = entries.filter(e => now - e.timestamp < oneHour);
        summary.circuitBreaker[state] = recent.reduce((sum, e) => sum + e.value, 0);
      }
    }

    // Response time stats
    const responseTimes = this.metrics.responseTime.get(host) || [];
    const recentResponseTimes = responseTimes
      .filter(e => now - e.timestamp < oneHour)
      .map(e => e.value);
    
    if (recentResponseTimes.length > 0) {
      recentResponseTimes.sort((a, b) => a - b);
      summary.responseTime = {
        count: recentResponseTimes.length,
        avg: recentResponseTimes.reduce((sum, t) => sum + t, 0) / recentResponseTimes.length,
        min: recentResponseTimes[0],
        max: recentResponseTimes[recentResponseTimes.length - 1],
        p50: recentResponseTimes[Math.floor(recentResponseTimes.length * 0.5)],
        p95: recentResponseTimes[Math.floor(recentResponseTimes.length * 0.95)],
        p99: recentResponseTimes[Math.floor(recentResponseTimes.length * 0.99)]
      };
    }

    // Error metrics
    for (const [key, entries] of this.metrics.errors.entries()) {
      if (key.startsWith(host + ':')) {
        const errorType = key.split(':')[1];
        const recent = entries.filter(e => now - e.timestamp < oneHour);
        summary.errors[errorType] = recent.reduce((sum, e) => sum + e.value, 0);
      }
    }

    return summary;
  }

  /**
   * Get metrics for all hosts
   */
  getAllMetrics() {
    const hosts = new Set();
    
    // Collect all hosts from all metric types
    for (const metricMap of Object.values(this.metrics)) {
      for (const key of metricMap.keys()) {
        const host = key.split(':')[0];
        hosts.add(host);
      }
    }

    const summary = {
      timestamp: Date.now(),
      hosts: {}
    };

    for (const host of hosts) {
      summary.hosts[host] = this.getHostMetrics(host);
    }

    return summary;
  }

  /**
   * Get rate limiting dashboard data
   */
  getRateLimitDashboard() {
    const dashboard = {
      timestamp: Date.now(),
      hosts: {}
    };

    for (const [key, entries] of this.metrics.rateLimits.entries()) {
      const [host, eventType] = key.split(':');
      if (!dashboard.hosts[host]) {
        dashboard.hosts[host] = {};
      }
      
      const recent = entries.filter(e => Date.now() - e.timestamp < 60 * 60 * 1000);
      dashboard.hosts[host][eventType] = recent.reduce((sum, e) => sum + e.value, 0);
    }

    return dashboard;
  }
}

// Global metrics instance
const httpMetrics = new HttpMetrics();

module.exports = {
  HttpMetrics,
  httpMetrics
};