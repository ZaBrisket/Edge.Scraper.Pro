const Bottleneck = require('bottleneck');
const { randomUUID } = require('crypto');
const {
  NetworkError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
} = require('./errors');
const config = require('../config');
const createLogger = require('./logging');
const metrics = require('./metrics');

const limiters = new Map();
const circuits = new Map();

// TTL cleanup for memory management
const LIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Track creation times for TTL cleanup
const limiterTimestamps = new Map();
const circuitTimestamps = new Map();

// Start cleanup interval
let cleanupInterval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

function cleanupExpiredEntries() {
  const now = Date.now();
  
  // Clean up expired limiters
  for (const [host, timestamp] of limiterTimestamps.entries()) {
    if (now - timestamp > LIMITER_TTL_MS) {
      const limiter = limiters.get(host);
      if (limiter) {
        // Stop the limiter before removing
        limiter.stop({ dropWaitingJobs: true });
        limiters.delete(host);
        limiterTimestamps.delete(host);
        console.log(`Cleaned up expired limiter for host: ${host}`);
      }
    }
  }
  
  // Clean up expired circuits
  for (const [host, timestamp] of circuitTimestamps.entries()) {
    if (now - timestamp > CIRCUIT_TTL_MS) {
      circuits.delete(host);
      circuitTimestamps.delete(host);
      console.log(`Cleaned up expired circuit for host: ${host}`);
    }
  }
}

// Graceful shutdown cleanup
process.on('SIGINT', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  // Clean up all limiters
  for (const [host, limiter] of limiters.entries()) {
    limiter.stop({ dropWaitingJobs: true });
  }
  limiters.clear();
  circuits.clear();
  limiterTimestamps.clear();
  circuitTimestamps.clear();
});

function getLimiter(host) {
  if (!limiters.has(host)) {
    const hostLimits = config.getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: config.MAX_CONCURRENCY,
      reservoir: hostLimits.burst,  // Initial burst capacity
      reservoirRefreshAmount: Math.floor(hostLimits.rps),  // Tokens per second
      reservoirRefreshInterval: 1000,  // Refresh every second
      minTime: Math.floor(1000 / hostLimits.rps),  // Minimum time between requests
    });
    
    // Track rate limit hits
    limiter.on('depleted', () => {
      metrics.increment('rate_limit.hit', { host });
    });
    
    limiters.set(host, limiter);
    limiterTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    limiterTimestamps.set(host, Date.now());
  }
  return limiters.get(host);
}

function getCircuit(host) {
  if (!circuits.has(host)) {
    circuits.set(host, {
      state: 'closed',
      failures: 0,
      successfulProbes: 0,
      openedAt: 0,
      lastFailureTime: 0,
    });
    circuitTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    circuitTimestamps.set(host, Date.now());
  }
  return circuits.get(host);
}

function parseRetryAfter(retryAfterHeader) {
  if (!retryAfterHeader) return null;
  
  // Check if it's a delay in seconds
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to milliseconds
  }
  
  // Check if it's an HTTP date
  const retryDate = new Date(retryAfterHeader);
  if (!isNaN(retryDate.getTime())) {
    const delay = retryDate.getTime() - Date.now();
    return Math.max(0, delay);
  }
  
  return null;
}

function calculateBackoff(attempt, maxDelay = config.RETRY_MAX_DELAY_MS) {
  const baseDelay = config.RETRY_INITIAL_DELAY_MS;
  // Exponential backoff with full jitter
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  const jitter = Math.random() * exponentialDelay;
  return Math.floor(jitter);
}

async function fetchWithPolicy(input, opts = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
  const host = url.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });

  // Check circuit breaker state
  if (circuit.state === 'open') {
    const timeSinceOpen = Date.now() - circuit.openedAt;
    if (timeSinceOpen > config.CIRCUIT_BREAKER_RESET_MS) {
      // Move to half-open for probing
      circuit.state = 'half-open';
      circuit.successfulProbes = 0;
      metrics.increment('circuit.transition', { host, from: 'open', to: 'half_open' });
      logger.info('Circuit breaker moved to half-open state');
    } else {
      metrics.increment('circuit.open_rejection', { host });
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { 
      ...(opts.headers || {}), 
      'x-correlation-id': correlationId,
      'User-Agent': config.USER_AGENT 
    };
    
    const startTime = Date.now();
    try {
      logger.info({ attempt }, 'outbound request');
      metrics.increment('http.requests', { host, attempt: attempt > 1 ? 'retry' : 'initial' });
      
      const res = await fetch(url.toString(), { ...opts, headers, signal: controller.signal });
      
      const duration = Date.now() - startTime;
      metrics.timing('http.request_duration', duration, { host, status: res.status });
      
      // Handle 429 specifically - don't count as circuit breaker failure
      if (res.status === 429) {
        metrics.increment('http.rate_limited', { host });
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        logger.warn({ retryAfter }, 'Received 429 rate limit response');
        
        const error = new RateLimitError('Rate limited by upstream', { 
          status: res.status, 
          retryAfter,
          headers: Object.fromEntries(res.headers.entries())
        });
        error.response = res;
        throw error;
      }
      
      // Handle server errors
      if (res.status >= 500) {
        metrics.increment('http.server_error', { host, status: res.status });
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      
      // Success - update circuit breaker
      metrics.increment('http.success', { host, status: res.status });
      if (circuit.state === 'half-open') {
        circuit.successfulProbes++;
        if (circuit.successfulProbes >= config.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS) {
          circuit.state = 'closed';
          circuit.failures = 0;
          metrics.increment('circuit.transition', { host, from: 'half_open', to: 'closed' });
          logger.info('Circuit breaker closed after successful probes');
        }
      } else {
        circuit.failures = 0;
      }
      
      return res;
    } catch (err) {
      const duration = Date.now() - startTime;
      
      if (err.name === 'AbortError') {
        metrics.increment('http.timeout', { host });
        metrics.timing('http.request_duration', duration, { host, status: 'timeout' });
        
        // Only count timeouts toward circuit breaker
        circuit.failures++;
        circuit.lastFailureTime = Date.now();
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.increment('circuit.transition', { host, from: circuit.state, to: 'open' });
          logger.error('Circuit breaker opened due to failures');
        }
        throw new TimeoutError('Request timed out', { timeout });
      }
      
      if (err instanceof RateLimitError) {
        // Don't count rate limits as circuit breaker failures
        throw err;
      }
      
      if (err instanceof NetworkError) {
        // Count network errors toward circuit breaker
        circuit.failures++;
        circuit.lastFailureTime = Date.now();
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.increment('circuit.transition', { host, from: circuit.state, to: 'open' });
          logger.error('Circuit breaker opened due to failures');
        }
        throw err;
      }
      
      metrics.increment('http.error', { host, error: err.name });
      throw new NetworkError(err.message, { cause: err });
    } finally {
      clearTimeout(timer);
    }
  };

  let attempt = 0;
  let lastError;
  
  while (attempt <= maxRetries) {
    try {
      // Use the rate limiter
      return await limiter.schedule({ id: correlationId }, () => attemptFetch(attempt + 1));
    } catch (err) {
      lastError = err;
      
      if (err instanceof CircuitOpenError || err instanceof TimeoutError) {
        // Don't retry on circuit open or timeout
        throw err;
      }
      
      if (attempt >= maxRetries) {
        // No more retries
        logger.error({ attempt, maxRetries }, 'Max retries exhausted');
        throw err;
      }
      
      // Calculate delay for retry
      let delayMs;
      if (err instanceof RateLimitError && err.meta?.retryAfter) {
        // Use Retry-After header if available
        delayMs = err.meta.retryAfter + Math.random() * 1000; // Add jitter
        metrics.increment('retry.scheduled', { host, reason: '429_retry_after' });
      } else {
        // Use exponential backoff with jitter
        delayMs = calculateBackoff(attempt + 1);
        metrics.increment('retry.scheduled', { host, reason: err.code || 'unknown' });
      }
      
      logger.info({ attempt: attempt + 1, delayMs, error: err.code }, 'Scheduling retry');
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Unknown error in fetch loop');
}

// Export the metrics instance for external access
fetchWithPolicy.metrics = metrics;

// Helper to get current stats
fetchWithPolicy.getStats = () => {
  const stats = {
    limiters: {},
    circuits: {},
    metrics: metrics.getStats()
  };
  
  // Add limiter info
  for (const [host, limiter] of limiters) {
    stats.limiters[host] = {
      running: limiter.running(),
      queued: limiter.queued(),
      done: limiter.done(),
    };
  }
  
  // Add circuit info
  for (const [host, circuit] of circuits) {
    stats.circuits[host] = {
      state: circuit.state,
      failures: circuit.failures,
      openedAt: circuit.openedAt,
      lastFailureTime: circuit.lastFailureTime,
    };
  }
  
  return stats;
};

module.exports = { fetchWithPolicy };