const config = require('../config');
const createLogger = require('./logging');

/**
 * Token bucket rate limiter implementation
 * Supports per-host rate limiting with configurable burst and refill rates
 */
class TokenBucket {
  constructor(rps, burst) {
    this.rps = rps; // requests per second
    this.burst = burst; // burst capacity
    this.tokens = burst; // current tokens
    this.lastRefill = Date.now();
    this.reservations = []; // queue of pending requests
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.rps;
    
    this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume a token immediately
   * @returns {boolean} true if token was available
   */
  tryConsume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Calculate wait time until next token is available
   * @returns {number} milliseconds to wait
   */
  getWaitTime() {
    this.refill();
    if (this.tokens >= 1) return 0;
    
    const tokensNeeded = 1 - this.tokens;
    const waitSeconds = tokensNeeded / this.rps;
    return Math.ceil(waitSeconds * 1000);
  }

  /**
   * Reserve a token with promise-based waiting
   * @param {number} maxWaitMs - maximum time to wait
   * @returns {Promise<void>} resolves when token is available
   */
  async reserve(maxWaitMs = 30000) {
    if (this.tryConsume()) {
      return Promise.resolve();
    }

    const waitTime = this.getWaitTime();
    if (waitTime > maxWaitMs) {
      throw new Error(`Rate limit wait time ${waitTime}ms exceeds maximum ${maxWaitMs}ms`);
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * Math.min(waitTime * 0.1, 100);
    const totalWait = waitTime + jitter;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.tryConsume()) {
          resolve();
        } else {
          reject(new Error('Token not available after wait'));
        }
      }, totalWait);

      // Store reservation for cleanup
      this.reservations.push({ timeout, resolve, reject });
    });
  }

  /**
   * Cancel all pending reservations
   */
  cancelReservations() {
    for (const reservation of this.reservations) {
      clearTimeout(reservation.timeout);
      reservation.reject(new Error('Rate limiter shutdown'));
    }
    this.reservations.length = 0;
  }

  /**
   * Get current stats
   */
  getStats() {
    this.refill();
    return {
      tokens: this.tokens,
      burst: this.burst,
      rps: this.rps,
      pendingReservations: this.reservations.length
    };
  }
}

/**
 * Per-host rate limiter manager
 */
class RateLimiterManager {
  constructor() {
    this.limiters = new Map();
    this.logger = createLogger();
    this.metrics = {
      hits: new Map(), // rate limit hits per host
      waits: new Map(), // wait times per host
      errors: new Map() // rate limit errors per host
    };
  }

  /**
   * Get or create rate limiter for host
   */
  getLimiter(host) {
    if (!this.limiters.has(host)) {
      const hostLimits = config.HOST_LIMITS[host] || config.HOST_LIMITS.DEFAULT || {
        rps: 2.0,
        burst: 5
      };

      const limiter = new TokenBucket(hostLimits.rps, hostLimits.burst);
      this.limiters.set(host, limiter);

      this.logger.info({
        host,
        rps: hostLimits.rps,
        burst: hostLimits.burst
      }, 'Created rate limiter for host');
    }

    return this.limiters.get(host);
  }

  /**
   * Acquire rate limit token for host
   * @param {string} host - target host
   * @param {string} correlationId - request correlation ID
   * @returns {Promise<void>} resolves when rate limit allows request
   */
  async acquire(host, correlationId) {
    const limiter = this.getLimiter(host);
    const logger = createLogger(correlationId).child({ host });

    // Try immediate consumption first
    if (limiter.tryConsume()) {
      logger.debug('Rate limit token acquired immediately');
      return;
    }

    // Need to wait - record metrics
    const waitTime = limiter.getWaitTime();
    this.recordMetric('hits', host);
    this.recordMetric('waits', host, waitTime);

    logger.info({ waitTime }, 'Rate limit hit, waiting for token');

    try {
      await limiter.reserve();
      logger.debug('Rate limit token acquired after wait');
    } catch (error) {
      this.recordMetric('errors', host);
      logger.error({ error: error.message }, 'Rate limit reservation failed');
      throw error;
    }
  }

  /**
   * Record metric for host
   */
  recordMetric(type, host, value = 1) {
    if (!this.metrics[type].has(host)) {
      this.metrics[type].set(host, []);
    }
    this.metrics[type].get(host).push({
      timestamp: Date.now(),
      value
    });

    // Keep only recent entries (last hour)
    const cutoff = Date.now() - 60 * 60 * 1000;
    this.metrics[type].set(host, 
      this.metrics[type].get(host).filter(m => m.timestamp > cutoff)
    );
  }

  /**
   * Get rate limiting stats for host
   */
  getStats(host) {
    const limiter = this.limiters.get(host);
    if (!limiter) return null;

    const hits = this.metrics.hits.get(host) || [];
    const waits = this.metrics.waits.get(host) || [];
    const errors = this.metrics.errors.get(host) || [];

    return {
      limiter: limiter.getStats(),
      metrics: {
        hits: hits.length,
        averageWait: waits.length > 0 ? waits.reduce((sum, w) => sum + w.value, 0) / waits.length : 0,
        errors: errors.length
      }
    };
  }

  /**
   * Get stats for all hosts
   */
  getAllStats() {
    const stats = {};
    for (const host of this.limiters.keys()) {
      stats[host] = this.getStats(host);
    }
    return stats;
  }

  /**
   * Shutdown all limiters
   */
  shutdown() {
    for (const limiter of this.limiters.values()) {
      limiter.cancelReservations();
    }
    this.limiters.clear();
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiterManager();

// Graceful shutdown
process.on('SIGINT', () => {
  rateLimiter.shutdown();
});

process.on('SIGTERM', () => {
  rateLimiter.shutdown();
});

module.exports = {
  TokenBucket,
  RateLimiterManager,
  rateLimiter
};