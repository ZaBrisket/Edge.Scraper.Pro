const Bottleneck = require('bottleneck');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const {
  NetworkError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
  ValidationError,
} = require('./errors');
const config = require('../config');
const createLogger = require('./logging');

// Input validation schemas
const urlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: 'URL must use http or https protocol' }
);

const fetchOptionsSchema = z.object({
  retries: z.number().int().min(0).max(10).optional(),
  timeout: z.number().int().min(100).max(300000).optional(), // 100ms to 5 minutes
  correlationId: z.string().min(1).optional(), // More lenient correlation ID validation
  headers: z.record(z.string()).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  body: z.any().optional(),
}).strict();

// Enhanced configuration with validation
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

// Global state with thread-safety considerations
const limiters = new Map();
const circuits = new Map();
const retryQueues = new Map();
const metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} },
  errors: { total: 0, byType: {} }
};

// TTL cleanup for memory management
const LIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Track creation times for TTL cleanup
const limiterTimestamps = new Map();
const circuitTimestamps = new Map();

// Track active requests for graceful shutdown
const activeRequests = new Set();

// Start cleanup interval
let cleanupInterval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
cleanupInterval.unref(); // Don't keep process alive just for cleanup

function cleanupExpiredEntries() {
  try {
    const now = Date.now();
    const logger = createLogger('cleanup');
    
    // Clean up expired limiters
    for (const [host, timestamp] of limiterTimestamps.entries()) {
      if (now - timestamp > LIMITER_TTL_MS) {
        const limiter = limiters.get(host);
        if (limiter) {
          try {
            limiter.stop({ dropWaitingJobs: true });
          } catch (err) {
            logger.error({ err, host }, 'Error stopping limiter during cleanup');
          }
          limiters.delete(host);
          limiterTimestamps.delete(host);
          logger.debug({ host }, 'Cleaned up expired limiter');
        }
      }
    }
    
    // Clean up expired circuits
    for (const [host, timestamp] of circuitTimestamps.entries()) {
      if (now - timestamp > CIRCUIT_TTL_MS) {
        circuits.delete(host);
        circuitTimestamps.delete(host);
        logger.debug({ host }, 'Cleaned up expired circuit');
      }
    }
  } catch (err) {
    const logger = createLogger('cleanup');
    logger.error({ err }, 'Error during cleanup');
  }
}

// Graceful shutdown handler
let isShuttingDown = false;
const shutdownHandler = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  const logger = createLogger('shutdown');
  logger.info({ signal }, 'Graceful shutdown initiated');
  
  // Stop accepting new requests
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  // Wait for active requests to complete (with timeout)
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout
  
  try {
    // Wait for active requests
    while (activeRequests.size > 0) {
      logger.info({ activeRequests: activeRequests.size }, 'Waiting for active requests');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clean up all limiters
    for (const [host, limiter] of limiters.entries()) {
      try {
        await limiter.stop({ dropWaitingJobs: false });
      } catch (err) {
        logger.error({ err, host }, 'Error stopping limiter during shutdown');
      }
    }
    
    limiters.clear();
    circuits.clear();
    retryQueues.clear();
    limiterTimestamps.clear();
    circuitTimestamps.clear();
    
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', shutdownHandler);
process.on('SIGTERM', shutdownHandler);

function validateUrl(input) {
  try {
    const url = typeof input === 'string' ? input : input.url || input.href;
    return urlSchema.parse(url);
  } catch (err) {
    throw new ValidationError(`Invalid URL: ${err.message}`, { 
      input: typeof input === 'string' ? input : JSON.stringify(input),
      errors: err.errors 
    });
  }
}

function validateOptions(opts) {
  try {
    return fetchOptionsSchema.parse(opts);
  } catch (err) {
    throw new ValidationError(`Invalid options: ${err.message}`, { 
      options: opts,
      errors: err.errors 
    });
  }
}

function getHostLimits(host) {
  if (!host || typeof host !== 'string') {
    throw new ValidationError('Invalid host', { host });
  }
  return ENHANCED_CONFIG.HOST_LIMITS[host] || ENHANCED_CONFIG.HOST_LIMITS.default;
}

function getLimiter(host) {
  if (!host || typeof host !== 'string') {
    throw new ValidationError('Invalid host for limiter', { host });
  }
  
  if (!limiters.has(host)) {
    const limits = getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: 1, // Conservative concurrency
      reservoir: limits.burst,
      reservoirRefreshAmount: limits.burst,
      reservoirRefreshInterval: 1000 / limits.rps, // Convert RPS to interval
      highWater: Math.max(limits.burst * 2, 10), // Prevent memory issues
      strategy: Bottleneck.strategy.OVERFLOW, // Drop excess requests
    });
    
    // Set up error handling
    limiter.on('error', (error) => {
      const logger = createLogger('limiter');
      logger.error({ error, host }, 'Limiter error');
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
  if (!host || typeof host !== 'string') {
    throw new ValidationError('Invalid host for circuit', { host });
  }
  
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
  try {
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
      case 'error':
        metrics.errors.total++;
        metrics.errors.byType[reason] = (metrics.errors.byType[reason] || 0) + 1;
        break;
    }
  } catch (err) {
    // Don't let metrics errors break the flow
    const logger = createLogger('metrics');
    logger.error({ err, type, host, status, reason }, 'Error updating metrics');
  }
}

function calculateBackoff(attempt, retryAfter = null) {
  // Validate inputs
  if (typeof attempt !== 'number' || attempt < 1) {
    throw new ValidationError('Invalid attempt number', { attempt });
  }
  
  if (retryAfter !== null && (typeof retryAfter !== 'number' || retryAfter < 0)) {
    throw new ValidationError('Invalid retry-after value', { retryAfter });
  }
  
  if (retryAfter) {
    // Use Retry-After header if present
    const baseDelay = Math.min(retryAfter * 1000, ENHANCED_CONFIG.MAX_BACKOFF_MS);
    const jitter = Math.random() * baseDelay * ENHANCED_CONFIG.JITTER_FACTOR;
    return Math.round(baseDelay + jitter);
  }
  
  // Exponential backoff with jitter
  const baseDelay = Math.min(
    ENHANCED_CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
    ENHANCED_CONFIG.MAX_BACKOFF_MS
  );
  const jitter = Math.random() * baseDelay * ENHANCED_CONFIG.JITTER_FACTOR;
  return Math.round(baseDelay + jitter);
}

async function scheduleRetry(host, url, attempt, retryAfter = null, correlationId) {
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
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fetchWithPolicy(url, { 
        retries: ENHANCED_CONFIG.MAX_RETRIES - attempt,
        correlationId 
      })
        .then(resolve)
        .catch(reject);
    }, delay);
    
    // Allow timer to be garbage collected if process exits
    timer.unref();
  });
}

async function fetchWithPolicy(input, opts = {}) {
  // Validate inputs
  const url = validateUrl(input);
  const options = validateOptions(opts);
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  
  // Check if shutting down
  if (isShuttingDown) {
    throw new NetworkError('Service is shutting down', { shuttingDown: true });
  }
  
  const requestId = randomUUID();
  const correlationId = options.correlationId || requestId;
  const logger = createLogger(correlationId).child({ host, url, requestId });
  
  // Track active request
  activeRequests.add(requestId);
  
  try {
    const limiter = getLimiter(host);
    const circuit = getCircuit(host);

    // Check circuit breaker state
    if (circuit.state === 'open') {
      if (Date.now() - circuit.openedAt > ENHANCED_CONFIG.CIRCUIT_BREAKER_RESET_MS) {
        circuit.state = 'half-open';
        circuit.halfOpenCalls = 0;
        updateMetrics('circuitChange', host);
        logger.info({ host }, 'Circuit breaker moved to half-open state');
      } else {
        updateMetrics('circuitChange', host);
        updateMetrics('error', host, null, 'circuit_open');
        throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
      }
    }

    if (circuit.state === 'half-open') {
      if (circuit.halfOpenCalls >= ENHANCED_CONFIG.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
        updateMetrics('error', host, null, 'circuit_half_open_limit');
        throw new CircuitOpenError(`Circuit for ${host} is half-open and call limit reached`, { host });
      }
      circuit.halfOpenCalls++;
    }

    const maxRetries = options.retries ?? ENHANCED_CONFIG.MAX_RETRIES;
    const timeout = options.timeout ?? ENHANCED_CONFIG.READ_TIMEOUT_MS;

    const attemptFetch = async (attempt) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeout);
      
      const headers = {
        'User-Agent': ENHANCED_CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'x-correlation-id': correlationId,
        'x-request-id': requestId,
        ...(options.headers || {})
      };

      try {
        logger.info({ attempt, host }, 'outbound request');
        
        // Add small random delay to smooth out requests
        if (attempt === 1 && ENHANCED_CONFIG.INTER_REQUEST_DELAY_MS > 0) {
          const jitter = Math.random() * ENHANCED_CONFIG.INTER_REQUEST_DELAY_MS;
          await new Promise(resolve => setTimeout(resolve, Math.round(jitter)));
        }
        
        const res = await fetch(url, { 
          ...options, 
          headers, 
          signal: controller.signal 
        });
        
        updateMetrics('request', host, res.status);
        
        // Handle 429 responses specially - DO NOT count as circuit breaker failure
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          let retryAfterSeconds = null;
          
          if (retryAfter) {
            // Parse Retry-After (can be seconds or HTTP date)
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              retryAfterSeconds = parsed;
            } else {
              // Try parsing as date
              const retryDate = new Date(retryAfter);
              if (!isNaN(retryDate.getTime())) {
                retryAfterSeconds = Math.max(0, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
              }
            }
          }
          
          updateMetrics('rateLimit', host);
          updateMetrics('deferral', host);
          
          logger.warn({
            status: res.status,
            retryAfter: retryAfterSeconds,
            attempt
          }, 'Rate limited - will retry');
          
          // If we have retries left, schedule a retry
          if (attempt < maxRetries) {
            return await scheduleRetry(host, url, attempt, retryAfterSeconds, correlationId);
          } else {
            // No more retries, but this is not a fatal error
            updateMetrics('error', host, null, 'rate_limit_exhausted');
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
          updateMetrics('error', host, null, `http_${res.status}`);
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
          updateMetrics('error', host, null, 'timeout');
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
        
        // Validation errors should bubble up
        if (err instanceof ValidationError) {
          throw err;
        }
        
        updateMetrics('error', host, null, 'network_error');
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
          err instanceof ValidationError ||
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
  } finally {
    // Clean up active request tracking
    activeRequests.delete(requestId);
  }
}

function getMetrics() {
  return {
    ...metrics,
    limiters: Array.from(limiters.keys()),
    circuits: Array.from(circuits.entries()).map(([host, circuit]) => ({
      host,
      state: circuit.state,
      failures: circuit.failures,
      ...(circuit.state === 'open' ? { openedAt: new Date(circuit.openedAt).toISOString() } : {})
    })),
    activeRequests: activeRequests.size
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

// Export a function to manually trigger cleanup (useful for tests)
function cleanup() {
  cleanupExpiredEntries();
}

module.exports = { 
  fetchWithPolicy, 
  getMetrics, 
  resetMetrics,
  cleanup,
  ENHANCED_CONFIG 
};