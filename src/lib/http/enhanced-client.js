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

// Enhanced configuration with per-host rate limiting
const ENHANCED_CONFIG = {
  // Per-host rate limits (RPS, Burst) - from config
  HOST_LIMITS: config.HOST_LIMITS,
  // Retry configuration
  MAX_RETRIES: config.MAX_RETRIES,
  RETRY_BUDGET_PER_BATCH: config.RETRY_BUDGET_PER_BATCH,
  // Backoff configuration
  BASE_BACKOFF_MS: config.BASE_BACKOFF_MS,
  MAX_BACKOFF_MS: config.MAX_BACKOFF_MS,
  JITTER_FACTOR: config.JITTER_FACTOR,
  // Circuit breaker configuration
  CIRCUIT_BREAKER_THRESHOLD: config.CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: config.CIRCUIT_BREAKER_RESET_MS,
  CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS,
  // Timeout configuration
  CONNECT_TIMEOUT_MS: config.CONNECT_TIMEOUT_MS,
  READ_TIMEOUT_MS: config.READ_TIMEOUT_MS,
  // User agent
  USER_AGENT: 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
  // Inter-request delay (jitter)
  INTER_REQUEST_DELAY_MS: config.INTER_REQUEST_DELAY_MS
};

// Global state
const limiters = new Map();
const circuits = new Map();
const retryQueues = new Map();
const metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} }
};

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
  retryQueues.clear();
  limiterTimestamps.clear();
  circuitTimestamps.clear();
});

function getHostLimits(host) {
  return ENHANCED_CONFIG.HOST_LIMITS[host] || ENHANCED_CONFIG.HOST_LIMITS.default;
}

function getLimiter(host) {
  if (!limiters.has(host)) {
    const limits = getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: 1, // Conservative concurrency
      reservoir: limits.burst,
      reservoirRefreshAmount: limits.burst,
      reservoirRefreshInterval: 1000 / limits.rps, // Convert RPS to interval
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
      openedAt: 0,
      halfOpenCalls: 0,
    });
    circuitTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    circuitTimestamps.set(host, Date.now());
  }
  return circuits.get(host);
}

function updateMetrics(type, host, status = null, reason = null) {
  metrics.requests.total++;
  metrics.requests.byHost[host] = (metrics.requests.byHost[host] || 0) + 1;
  
  if (status) {
    const statusClass = Math.floor(status / 100) * 100;
    metrics.requests.byStatus[statusClass] = (metrics.requests.byStatus[statusClass] || 0) + 1;
  }
  
  switch (type) {
    case 'rateLimit':
      metrics.rateLimits.hits++;
      metrics.rateLimits.byHost[host] = (metrics.rateLimits.byHost[host] || 0) + 1;
      break;
    case 'retry':
      metrics.retries.scheduled++;
      metrics.retries.byReason[reason] = (metrics.retries.byReason[reason] || 0) + 1;
      break;
    case 'deferral':
      metrics.deferrals.count++;
      metrics.deferrals.byHost[host] = (metrics.deferrals.byHost[host] || 0) + 1;
      break;
    case 'circuitChange':
      metrics.circuitBreaker.stateChanges++;
      metrics.circuitBreaker.byHost[host] = (metrics.circuitBreaker.byHost[host] || 0) + 1;
      break;
  }
}

function calculateBackoff(attempt, retryAfter = null) {
  if (retryAfter) {
    // Use Retry-After header if present
    const baseDelay = Math.min(retryAfter * 1000, ENHANCED_CONFIG.MAX_BACKOFF_MS);
    const jitter = Math.random() * baseDelay * ENHANCED_CONFIG.JITTER_FACTOR;
    return baseDelay + jitter;
  }
  
  // Exponential backoff with jitter
  const baseDelay = Math.min(
    ENHANCED_CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
    ENHANCED_CONFIG.MAX_BACKOFF_MS
  );
  const jitter = Math.random() * baseDelay * ENHANCED_CONFIG.JITTER_FACTOR;
  return baseDelay + jitter;
}

function scheduleRetry(host, url, attempt, retryAfter = null, correlationId) {
  const delay = calculateBackoff(attempt, retryAfter);
  const retryAt = Date.now() + delay;
  
  updateMetrics('retry', host, null, '429');
  
  const logger = createLogger(correlationId);
  logger.info({
    host,
    url,
    attempt,
    retryAfter,
    delay,
    retryAt: new Date(retryAt).toISOString()
  }, 'Retry scheduled for 429 response');
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(fetchWithPolicy(url, { 
        retries: ENHANCED_CONFIG.MAX_RETRIES - attempt,
        correlationId 
      }));
    }, delay);
  });
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
    if (Date.now() - circuit.openedAt > ENHANCED_CONFIG.CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
      circuit.halfOpenCalls = 0;
      updateMetrics('circuitChange', host);
      logger.info({ host }, 'Circuit breaker moved to half-open state');
    } else {
      updateMetrics('circuitChange', host);
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }

  if (circuit.state === 'half-open') {
    if (circuit.halfOpenCalls >= ENHANCED_CONFIG.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
      throw new CircuitOpenError(`Circuit for ${host} is half-open and call limit reached`, { host });
    }
    circuit.halfOpenCalls++;
  }

  const maxRetries = opts.retries ?? ENHANCED_CONFIG.MAX_RETRIES;
  const timeout = opts.timeout ?? ENHANCED_CONFIG.READ_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    
    const headers = {
      'User-Agent': ENHANCED_CONFIG.USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'x-correlation-id': correlationId,
      ...(opts.headers || {})
    };

    try {
      logger.info({ attempt, host }, 'outbound request');
      
      // Add small random delay to smooth out requests
      if (attempt === 1) {
        const jitter = Math.random() * ENHANCED_CONFIG.INTER_REQUEST_DELAY_MS;
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
      
      const res = await fetch(url.toString(), { 
        ...opts, 
        headers, 
        signal: controller.signal 
      });
      
      updateMetrics('request', host, res.status);
      
      // Handle 429 responses specially - DO NOT count as circuit breaker failure
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
        
        updateMetrics('rateLimit', host);
        updateMetrics('deferral', host);
        
        logger.warn({
          status: res.status,
          retryAfter: retryAfterSeconds,
          attempt
        }, 'Rate limited - will retry');
        
        // If we have retries left, schedule a retry
        if (attempt < maxRetries) {
          return await scheduleRetry(host, url.toString(), attempt, retryAfterSeconds, correlationId);
        } else {
          // No more retries, but this is not a fatal error
          throw new RateLimitError('Rate limit exceeded after retries', { 
            status: res.status,
            retryAfter: retryAfterSeconds,
            attempts: attempt
          });
        }
      }
      
      // Handle 5xx responses - these count toward circuit breaker
      if (res.status >= 500) {
        circuit.failures++;
        if (circuit.failures >= ENHANCED_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
          logger.error({ host, failures: circuit.failures }, 'Circuit breaker opened');
        }
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      
      // Success - reset circuit breaker
      if (circuit.state !== 'closed') {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.halfOpenCalls = 0;
        updateMetrics('circuitChange', host);
        logger.info({ host }, 'Circuit breaker closed');
      }
      
      return res;
      
    } catch (err) {
      if (err.name === 'AbortError') {
        circuit.failures++;
        if (circuit.failures >= ENHANCED_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
        }
        throw new TimeoutError('Request timed out', { timeout });
      }
      
      // Only count network errors and 5xx as circuit breaker failures
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= ENHANCED_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
        }
        throw err;
      }
      
      // Rate limit errors don't count toward circuit breaker
      if (err instanceof RateLimitError) {
        throw err;
      }
      
      throw new NetworkError(err.message, { cause: err });
    } finally {
      clearTimeout(timer);
    }
  };

  let attempt = 0;
  while (true) {
    try {
      return await limiter.schedule(() => attemptFetch(attempt + 1));
    } catch (err) {
      if (
        err instanceof CircuitOpenError ||
        err instanceof TimeoutError ||
        attempt >= maxRetries
      ) {
        throw err;
      }
      
      // Don't retry rate limit errors - they're handled internally
      if (err instanceof RateLimitError) {
        throw err;
      }
      
      attempt++;
      const backoff = calculateBackoff(attempt);
      logger.info({ attempt, backoff, error: err.message }, 'Retrying after error');
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

function getMetrics() {
  return {
    ...metrics,
    limiters: Array.from(limiters.keys()),
    circuits: Array.from(circuits.entries()).map(([host, circuit]) => ({
      host,
      state: circuit.state,
      failures: circuit.failures
    }))
  };
}

function resetMetrics() {
  Object.keys(metrics).forEach(key => {
    if (typeof metrics[key] === 'object' && metrics[key] !== null) {
      if (Array.isArray(metrics[key])) {
        metrics[key] = [];
      } else {
        Object.keys(metrics[key]).forEach(subKey => {
          if (typeof metrics[key][subKey] === 'number') {
            metrics[key][subKey] = 0;
          } else if (typeof metrics[key][subKey] === 'object') {
            metrics[key][subKey] = {};
          }
        });
      }
    } else if (typeof metrics[key] === 'number') {
      metrics[key] = 0;
    }
  });
}

module.exports = { 
  fetchWithPolicy, 
  getMetrics, 
  resetMetrics,
  ENHANCED_CONFIG 
};