const { randomUUID } = require('crypto');
const {
  NetworkError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
} = require('./errors');
const config = require('../config');
const createLogger = require('./logging');
const { rateLimiter } = require('./rate-limiter');
const { httpMetrics } = require('./metrics');

/**
 * Circuit breaker implementation with proper 429 handling
 */
class CircuitBreaker {
  constructor(host) {
    this.host = host;
    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.openedAt = 0;
    this.halfOpenCalls = 0;
    this.logger = createLogger().child({ component: 'circuit-breaker', host });
  }

  /**
   * Check if request should be allowed through circuit
   */
  canExecute() {
    const now = Date.now();

    switch (this.state) {
      case 'closed':
        return true;
      
      case 'open':
        if (now - this.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
          this.logger.info('Circuit breaker transitioning to half-open');
          this.state = 'half-open';
          this.halfOpenCalls = 0;
          httpMetrics.recordCircuitStateChange(this.host, 'open', 'half-open');
          return true;
        }
        return false;
      
      case 'half-open':
        return this.halfOpenCalls < config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS;
      
      default:
        return false;
    }
  }

  /**
   * Record successful request (excludes 429s)
   */
  recordSuccess() {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
        this.logger.info('Circuit breaker closing after successful half-open period');
        this.state = 'closed';
        this.successes = 0;
        httpMetrics.recordCircuitStateChange(this.host, 'half-open', 'closed');
      }
    }
  }

  /**
   * Record failure (only genuine failures, NOT 429s)
   */
  recordFailure() {
    this.failures++;
    
    if (this.state === 'half-open') {
      this.logger.warn('Circuit breaker opening due to half-open failure');
      this.state = 'open';
      this.openedAt = Date.now();
      this.successes = 0;
      httpMetrics.recordCircuitStateChange(this.host, 'half-open', 'open');
    } else if (this.state === 'closed' && this.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
      this.logger.warn({ failures: this.failures }, 'Circuit breaker opening due to failure threshold');
      this.state = 'open';
      this.openedAt = Date.now();
      httpMetrics.recordCircuitStateChange(this.host, 'closed', 'open');
    }
  }

  /**
   * Record 429 rate limit (does NOT count as failure)
   */
  record429() {
    // 429s are not failures - they're expected rate limiting
    // Do not increment failure count or affect circuit state
    this.logger.debug('Rate limit 429 received, not counting as failure');
  }

  /**
   * Track half-open call
   */
  recordHalfOpenCall() {
    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }
  }
}

// Circuit breaker instances per host
const circuits = new Map();

function getCircuit(host) {
  if (!circuits.has(host)) {
    circuits.set(host, new CircuitBreaker(host));
  }
  return circuits.get(host);
}

/**
 * Parse Retry-After header value
 */
function parseRetryAfter(retryAfterHeader) {
  if (!retryAfterHeader) return null;
  
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // convert to ms
  }
  
  // Try parsing as HTTP date
  const date = new Date(retryAfterHeader);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  
  return null;
}

/**
 * Calculate exponential backoff with full jitter
 */
function calculateBackoff(attempt, baseDelayMs = config.RETRY_BASE_DELAY_MS) {
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attempt - 1),
    config.RETRY_MAX_DELAY_MS
  );
  
  // Full jitter: random value between 0 and exponentialDelay
  const jitter = Math.random() * exponentialDelay;
  const additionalJitter = Math.random() * config.RETRY_JITTER_MAX_MS;
  
  return Math.ceil(jitter + additionalJitter);
}

/**
 * Enhanced HTTP client with resilient rate limiting and 429 handling
 */
async function fetchWithPolicy(input, opts = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
  const host = url.host;
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });
  const circuit = getCircuit(host);
  
  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;
  
  // User-Agent for politeness
  const defaultHeaders = {
    'User-Agent': 'edge-scraper-pro/2.0.0 (+https://github.com/edge-scraper)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };

  /**
   * Single HTTP request attempt
   */
  const attemptFetch = async (attempt) => {
    // Check circuit breaker
    if (!circuit.canExecute()) {
      const error = new CircuitOpenError(`Circuit for ${host} is open`, { host });
      httpMetrics.recordError(host, 'CIRCUIT_OPEN', error.message, correlationId);
      throw error;
    }

    if (circuit.state === 'half-open') {
      circuit.recordHalfOpenCall();
    }

    // Acquire rate limit token
    try {
      await rateLimiter.acquire(host, correlationId);
    } catch (rateLimitError) {
      httpMetrics.recordError(host, 'RATE_LIMIT_TIMEOUT', rateLimitError.message, correlationId);
      throw new RateLimitError('Rate limit acquisition timeout', { 
        host, 
        cause: rateLimitError 
      });
    }

    // Execute HTTP request
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { 
      ...defaultHeaders,
      ...(opts.headers || {}), 
      'x-correlation-id': correlationId 
    };

    const startTime = Date.now();
    
    try {
      logger.info({ attempt, timeout }, 'Executing HTTP request');
      
      const response = await fetch(url.toString(), { 
        ...opts, 
        headers, 
        signal: controller.signal 
      });
      
      const responseTime = Date.now() - startTime;
      httpMetrics.recordRequest(host, response.status, responseTime, correlationId);
      
      // Handle different response status codes
      if (response.status === 429) {
        // Rate limited by upstream - this is NOT a failure
        circuit.record429();
        
        const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
        httpMetrics.record429Deferred(host, retryAfterMs, correlationId);
        
        throw new RateLimitError('Upstream rate limited', { 
          status: response.status,
          retryAfter: retryAfterMs,
          headers: Object.fromEntries(response.headers.entries())
        });
      }
      
      if (response.status >= 500) {
        // Genuine server error - counts as failure
        circuit.recordFailure();
        const error = new NetworkError(`Upstream server error ${response.status}`, { 
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        });
        httpMetrics.recordError(host, 'SERVER_ERROR', error.message, correlationId);
        throw error;
      }
      
      if (response.status >= 400) {
        // Client error - not a circuit breaker failure but still an error
        const error = new NetworkError(`Client error ${response.status}`, { 
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        });
        httpMetrics.recordError(host, 'CLIENT_ERROR', error.message, correlationId);
        throw error;
      }
      
      // Success!
      circuit.recordSuccess();
      logger.info({ 
        statusCode: response.status, 
        responseTime,
        contentLength: response.headers.get('content-length')
      }, 'Request completed successfully');
      
      return response;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        circuit.recordFailure();
        const timeoutError = new TimeoutError('Request timed out', { timeout, responseTime });
        httpMetrics.recordError(host, 'TIMEOUT', timeoutError.message, correlationId);
        throw timeoutError;
      }
      
      if (error instanceof RateLimitError) {
        // Don't record as circuit failure - just re-throw for retry logic
        throw error;
      }
      
      if (error instanceof NetworkError) {
        // Already handled above
        throw error;
      }
      
      // Network/connection error
      circuit.recordFailure();
      const networkError = new NetworkError('Network error', { 
        cause: error,
        responseTime
      });
      httpMetrics.recordError(host, 'NETWORK_ERROR', networkError.message, correlationId);
      throw networkError;
      
    } finally {
      clearTimeout(timer);
    }
  };

  // Retry loop with intelligent backoff
  let attempt = 0;
  let lastError = null;
  
  while (attempt <= maxRetries) {
    try {
      return await attemptFetch(attempt + 1);
    } catch (error) {
      lastError = error;
      attempt++;
      
      // Don't retry certain error types
      if (error instanceof CircuitOpenError || 
          error instanceof TimeoutError ||
          (error instanceof NetworkError && error.meta?.status && error.meta.status < 500)) {
        throw error;
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt > maxRetries) {
        break;
      }
      
      // Calculate backoff delay
      let delayMs;
      let reason;
      
      if (error instanceof RateLimitError && error.meta?.retryAfter) {
        // Use Retry-After header if available
        delayMs = error.meta.retryAfter;
        reason = '429_retry_after';
      } else if (error instanceof RateLimitError) {
        // Exponential backoff for rate limits without Retry-After
        delayMs = calculateBackoff(attempt);
        reason = '429_backoff';
      } else {
        // Standard exponential backoff for other errors
        delayMs = calculateBackoff(attempt);
        reason = 'error_backoff';
      }
      
      httpMetrics.recordRetryScheduled(host, reason, delayMs, attempt, correlationId);
      
      logger.warn({ 
        error: error.message, 
        attempt, 
        maxRetries, 
        delayMs, 
        reason 
      }, 'Request failed, scheduling retry');
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // All retries exhausted
  logger.error({ 
    attempts: attempt, 
    maxRetries, 
    finalError: lastError?.message 
  }, 'Request failed after all retries exhausted');
  
  throw lastError;
}

/**
 * Get circuit breaker stats for observability
 */
function getCircuitStats() {
  const stats = {};
  for (const [host, circuit] of circuits.entries()) {
    stats[host] = {
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      openedAt: circuit.openedAt,
      halfOpenCalls: circuit.halfOpenCalls
    };
  }
  return stats;
}

/**
 * Shutdown cleanup
 */
function shutdown() {
  circuits.clear();
  rateLimiter.shutdown();
}

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { 
  fetchWithPolicy,
  getCircuitStats,
  shutdown
};
