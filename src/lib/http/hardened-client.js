/**
 * Hardened HTTP Client for Edge.Scraper.Pro
 * 
 * This module provides a production-ready HTTP client with comprehensive:
 * - Input validation and sanitization
 * - Robust error handling with structured errors
 * - Timeout management with bounded retries
 * - Circuit breaker pattern with proper state management
 * - Rate limiting with jitter and backoff
 * - Resource cleanup and graceful shutdown
 * - Comprehensive observability and metrics
 */

const Bottleneck = require('bottleneck');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const {
  NetworkError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
  ValidationError,
  ParseError,
} = require('./errors');
const config = require('../config');
const createLogger = require('./logging');

// Input validation schemas
const URL_SCHEMA = z.string().url().min(1).max(2048);
const OPTIONS_SCHEMA = z.object({
  timeout: z.number().int().positive().max(300000).optional(), // Max 5 minutes
  retries: z.number().int().min(0).max(10).optional(),
  headers: z.record(z.string()).optional(),
  correlationId: z.string().uuid().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  body: z.union([z.string(), z.instanceof(Buffer), z.null()]).optional(),
}).strict();

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

// Rate limiter and circuit breaker storage
const limiters = new Map();
const circuits = new Map();
const activeRequests = new Map(); // Track active requests for cleanup

// Comprehensive metrics
const metrics = {
  requests: { 
    total: 0, 
    byHost: {}, 
    byStatus: {},
    byMethod: {},
    active: 0,
    completed: 0,
    failed: 0
  },
  rateLimits: { 
    hits: 0, 
    byHost: {},
    totalDelayMs: 0
  },
  retries: { 
    scheduled: 0, 
    byReason: {},
    totalDelayMs: 0
  },
  circuitBreaker: { 
    stateChanges: 0, 
    byHost: {},
    totalOpenTimeMs: 0
  },
  deferrals: { 
    count: 0, 
    byHost: {},
    totalDelayMs: 0
  },
  timeouts: {
    count: 0,
    byHost: {},
    totalTimeoutMs: 0
  },
  errors: {
    total: 0,
    byType: {},
    byHost: {}
  },
  performance: {
    totalResponseTimeMs: 0,
    averageResponseTimeMs: 0,
    p95ResponseTimeMs: 0,
    responseTimes: [] // Keep last 1000 for percentile calculation
  }
};

/**
 * Get host-specific rate limiting configuration
 */
function getHostLimits(host) {
  if (!host || typeof host !== 'string') {
    throw new ValidationError('Host must be a non-empty string');
  }
  
  const normalizedHost = host.toLowerCase().trim();
  return config.HOST_LIMITS[normalizedHost] || config.HOST_LIMITS.default;
}

/**
 * Get or create rate limiter for host
 */
function getLimiter(host) {
  if (!limiters.has(host)) {
    const limits = getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: 1,
      reservoir: limits.burst,
      reservoirRefreshAmount: limits.burst,
      reservoirRefreshInterval: 1000 / limits.rps,
      // Add error handling for limiter
      rejectOnDrop: false,
      trackDoneStatus: true
    });
    
    // Handle limiter errors
    limiter.on('error', (error) => {
      const logger = createLogger();
      logger.error({ host, error: error.message }, 'Rate limiter error');
      updateMetrics('error', host, null, 'limiter_error');
    });
    
    limiters.set(host, limiter);
  }
  return limiters.get(host);
}

/**
 * Get or create circuit breaker for host
 */
function getCircuit(host) {
  if (!circuits.has(host)) {
    circuits.set(host, {
      state: CIRCUIT_STATES.CLOSED,
      failures: 0,
      openedAt: 0,
      halfOpenCalls: 0,
      lastFailureAt: 0,
      successCount: 0
    });
  }
  return circuits.get(host);
}

/**
 * Update comprehensive metrics
 */
function updateMetrics(type, host, status = null, reason = null, additionalData = {}) {
  const timestamp = Date.now();
  
  // Update request metrics
  metrics.requests.total++;
  metrics.requests.byHost[host] = (metrics.requests.byHost[host] || 0) + 1;
  
  if (status) {
    const statusClass = Math.floor(status / 100) * 100;
    metrics.requests.byStatus[statusClass] = (metrics.requests.byStatus[statusClass] || 0) + 1;
  }
  
  // Update specific metric types
  switch (type) {
    case 'request_start':
      metrics.requests.active++;
      break;
    case 'request_complete':
      metrics.requests.active = Math.max(0, metrics.requests.active - 1);
      metrics.requests.completed++;
      break;
    case 'request_fail':
      metrics.requests.active = Math.max(0, metrics.requests.active - 1);
      metrics.requests.failed++;
      break;
    case 'rateLimit':
      metrics.rateLimits.hits++;
      metrics.rateLimits.byHost[host] = (metrics.rateLimits.byHost[host] || 0) + 1;
      if (additionalData.delayMs) {
        metrics.rateLimits.totalDelayMs += additionalData.delayMs;
      }
      break;
    case 'retry':
      metrics.retries.scheduled++;
      metrics.retries.byReason[reason] = (metrics.retries.byReason[reason] || 0) + 1;
      if (additionalData.delayMs) {
        metrics.retries.totalDelayMs += additionalData.delayMs;
      }
      break;
    case 'deferral':
      metrics.deferrals.count++;
      metrics.deferrals.byHost[host] = (metrics.deferrals.byHost[host] || 0) + 1;
      if (additionalData.delayMs) {
        metrics.deferrals.totalDelayMs += additionalData.delayMs;
      }
      break;
    case 'circuitChange':
      metrics.circuitBreaker.stateChanges++;
      metrics.circuitBreaker.byHost[host] = (metrics.circuitBreaker.byHost[host] || 0) + 1;
      if (additionalData.state === CIRCUIT_STATES.OPEN) {
        metrics.circuitBreaker.totalOpenTimeMs += additionalData.openDurationMs || 0;
      }
      break;
    case 'timeout':
      metrics.timeouts.count++;
      metrics.timeouts.byHost[host] = (metrics.timeouts.byHost[host] || 0) + 1;
      if (additionalData.timeoutMs) {
        metrics.timeouts.totalTimeoutMs += additionalData.timeoutMs;
      }
      break;
    case 'error':
      metrics.errors.total++;
      metrics.errors.byType[reason] = (metrics.errors.byType[reason] || 0) + 1;
      metrics.errors.byHost[host] = (metrics.errors.byHost[host] || 0) + 1;
      break;
    case 'response_time':
      if (additionalData.responseTimeMs) {
        metrics.performance.totalResponseTimeMs += additionalData.responseTimeMs;
        metrics.performance.responseTimes.push(additionalData.responseTimeMs);
        
        // Keep only last 1000 response times
        if (metrics.performance.responseTimes.length > 1000) {
          metrics.performance.responseTimes.shift();
        }
        
        // Calculate average
        metrics.performance.averageResponseTimeMs = 
          metrics.performance.totalResponseTimeMs / metrics.requests.completed;
        
        // Calculate p95
        const sorted = [...metrics.performance.responseTimes].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        metrics.performance.p95ResponseTimeMs = sorted[p95Index] || 0;
      }
      break;
  }
}

/**
 * Calculate backoff with jitter
 */
function calculateBackoff(attempt, retryAfter = null, baseDelay = null) {
  if (retryAfter) {
    const baseDelayMs = Math.min(retryAfter * 1000, config.MAX_BACKOFF_MS);
    const jitter = Math.random() * baseDelayMs * config.JITTER_FACTOR;
    return Math.floor(baseDelayMs + jitter);
  }
  
  const baseDelayMs = baseDelay || Math.min(
    config.BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
    config.MAX_BACKOFF_MS
  );
  const jitter = Math.random() * baseDelayMs * config.JITTER_FACTOR;
  return Math.floor(baseDelayMs + jitter);
}

/**
 * Validate and sanitize input
 */
function validateInput(input, options = {}) {
  try {
    // Handle null/undefined input
    if (input === null || input === undefined) {
      throw new ValidationError('Input cannot be null or undefined');
    }
    
    // Validate URL
    const url = typeof input === 'string' ? input : (input && (input.url || input.href));
    if (!url) {
      throw new ValidationError('URL is required and must be a string or object with url/href property');
    }
    
    const validatedUrl = URL_SCHEMA.parse(url);
    
    // Validate options
    const validatedOptions = OPTIONS_SCHEMA.parse(options);
    
    // Additional URL validation
    const urlObj = new URL(validatedUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new ValidationError('Only HTTP and HTTPS protocols are supported');
    }
    
    // Check for suspicious patterns
    if (urlObj.hostname.includes('..') || urlObj.hostname.includes('//')) {
      throw new ValidationError('Invalid hostname pattern detected');
    }
    
    return {
      url: validatedUrl,
      urlObj,
      options: validatedOptions
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Input validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Create request ID for tracking
 */
function createRequestId() {
  return randomUUID();
}

/**
 * Main fetch function with comprehensive hardening
 */
async function fetchWithPolicy(input, opts = {}) {
  const requestId = createRequestId();
  const startTime = Date.now();
  
  // Validate input
  let validatedInput;
  try {
    validatedInput = validateInput(input, opts);
  } catch (error) {
    updateMetrics('error', 'unknown', null, 'validation_error');
    throw error;
  }
  
  const { url, urlObj, options } = validatedInput;
  const host = urlObj.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = options.correlationId || requestId;
  const logger = createLogger(correlationId).child({ 
    host, 
    url: url.toString(), 
    requestId,
    method: options.method || 'GET'
  });

  // Track active request
  activeRequests.set(requestId, {
    host,
    url,
    startTime,
    correlationId
  });
  
  updateMetrics('request_start', host);

  try {
    // Check circuit breaker state
    if (circuit.state === CIRCUIT_STATES.OPEN) {
      const timeSinceOpen = Date.now() - circuit.openedAt;
      if (timeSinceOpen > config.CIRCUIT_BREAKER_RESET_MS) {
        circuit.state = CIRCUIT_STATES.HALF_OPEN;
        circuit.halfOpenCalls = 0;
        circuit.successCount = 0;
        updateMetrics('circuitChange', host, null, 'half_open', { 
          state: CIRCUIT_STATES.HALF_OPEN 
        });
        logger.info({ host, timeSinceOpen }, 'Circuit breaker moved to half-open state');
      } else {
        updateMetrics('circuitChange', host, null, 'circuit_open', { 
          state: CIRCUIT_STATES.OPEN 
        });
        throw new CircuitOpenError(`Circuit for ${host} is open`, { 
          host, 
          openedAt: circuit.openedAt,
          timeSinceOpen 
        });
      }
    }

    if (circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      if (circuit.halfOpenCalls >= config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
        throw new CircuitOpenError(`Circuit for ${host} is half-open and call limit reached`, { 
          host,
          halfOpenCalls: circuit.halfOpenCalls,
          maxCalls: config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS
        });
      }
      circuit.halfOpenCalls++;
    }

    const maxRetries = options.retries ?? config.MAX_RETRIES;
    const timeout = options.timeout ?? config.READ_TIMEOUT_MS;

    const attemptFetch = async (attempt) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        updateMetrics('timeout', host, null, 'request_timeout', { timeoutMs: timeout });
      }, timeout);
      
      const headers = {
        'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'x-correlation-id': correlationId,
        'x-request-id': requestId,
        ...(options.headers || {})
      };

      try {
        logger.info({ 
          attempt, 
          host, 
          method: options.method || 'GET',
          timeout 
        }, 'outbound request');
        
        const fetchOptions = {
          method: options.method || 'GET',
          headers,
          signal: controller.signal,
          ...(options.body && { body: options.body })
        };
        
        const res = await fetch(url, fetchOptions);
        const responseTime = Date.now() - startTime;
        
        updateMetrics('request_complete', host, res.status);
        updateMetrics('response_time', host, res.status, null, { responseTimeMs: responseTime });
        
        // Handle 429 responses specially - DO NOT count as circuit breaker failure
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
          
          updateMetrics('rateLimit', host, res.status, '429', { 
            retryAfterSeconds,
            attempt 
          });
          updateMetrics('deferral', host, res.status, '429');
          
          logger.warn({
            status: res.status,
            retryAfter: retryAfterSeconds,
            attempt,
            responseTime
          }, 'Rate limited - will retry');
          
          // If we have retries left, schedule a retry
          if (attempt < maxRetries) {
            const delay = calculateBackoff(attempt, retryAfterSeconds);
            logger.info({ delay, attempt, retryAfterSeconds }, 'Scheduling retry for 429');
            updateMetrics('retry', host, res.status, '429', { delayMs: delay });
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return await attemptFetch(attempt + 1);
          } else {
            throw new RateLimitError('Rate limit exceeded after retries', { 
              status: res.status,
              retryAfter: retryAfterSeconds,
              attempts: attempt,
              maxRetries
            });
          }
        }
        
        // Handle 5xx responses - these count toward circuit breaker
        if (res.status >= 500) {
          circuit.failures++;
          circuit.lastFailureAt = Date.now();
          
          if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
            circuit.state = CIRCUIT_STATES.OPEN;
            circuit.openedAt = Date.now();
            updateMetrics('circuitChange', host, res.status, 'circuit_open', { 
              state: CIRCUIT_STATES.OPEN,
              failures: circuit.failures
            });
            logger.error({ 
              host, 
              failures: circuit.failures, 
              threshold: config.CIRCUIT_BREAKER_THRESHOLD 
            }, 'Circuit breaker opened');
          }
          
          throw new NetworkError(`Upstream ${res.status}`, { 
            status: res.status,
            host,
            failures: circuit.failures
          });
        }
        
        // Success - reset circuit breaker if needed
        if (circuit.state !== CIRCUIT_STATES.CLOSED) {
          circuit.successCount++;
          if (circuit.state === CIRCUIT_STATES.HALF_OPEN && circuit.successCount >= 2) {
            circuit.state = CIRCUIT_STATES.CLOSED;
            circuit.failures = 0;
            circuit.halfOpenCalls = 0;
            circuit.successCount = 0;
            updateMetrics('circuitChange', host, res.status, 'circuit_closed', { 
              state: CIRCUIT_STATES.CLOSED 
            });
            logger.info({ host, successCount: circuit.successCount }, 'Circuit breaker closed');
          }
        }
        
        return res;
        
      } catch (err) {
        if (err.name === 'AbortError') {
          circuit.failures++;
          circuit.lastFailureAt = Date.now();
          
          if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
            circuit.state = CIRCUIT_STATES.OPEN;
            circuit.openedAt = Date.now();
            updateMetrics('circuitChange', host, null, 'circuit_open_timeout', { 
              state: CIRCUIT_STATES.OPEN,
              failures: circuit.failures
            });
          }
          
          throw new TimeoutError('Request timed out', { 
            timeout,
            host,
            attempt,
            responseTime: Date.now() - startTime
          });
        }
        
        // Only count network errors and 5xx as circuit breaker failures
        if (err instanceof NetworkError) {
          circuit.failures++;
          circuit.lastFailureAt = Date.now();
          
          if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
            circuit.state = CIRCUIT_STATES.OPEN;
            circuit.openedAt = Date.now();
            updateMetrics('circuitChange', host, null, 'circuit_open_network', { 
              state: CIRCUIT_STATES.OPEN,
              failures: circuit.failures
            });
          }
          throw err;
        }
        
        // Rate limit errors don't count toward circuit breaker
        if (err instanceof RateLimitError) {
          throw err;
        }
        
        // Validation errors don't count toward circuit breaker
        if (err instanceof ValidationError) {
          throw err;
        }
        
        throw new NetworkError(err.message, { 
          cause: err,
          host,
          attempt,
          responseTime: Date.now() - startTime
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let attempt = 0;
    while (true) {
      try {
        const result = await limiter.schedule(() => attemptFetch(attempt + 1));
        updateMetrics('request_complete', host, result.status);
        return result;
      } catch (err) {
        if (
          err instanceof CircuitOpenError ||
          err instanceof TimeoutError ||
          err instanceof RateLimitError ||
          err instanceof ValidationError ||
          attempt >= maxRetries
        ) {
          updateMetrics('request_fail', host, null, err.constructor.name);
          throw err;
        }
        
        attempt++;
        const backoff = calculateBackoff(attempt);
        logger.info({ 
          attempt, 
          backoff, 
          error: err.message,
          errorType: err.constructor.name 
        }, 'Retrying after error');
        
        updateMetrics('retry', host, null, err.constructor.name, { delayMs: backoff });
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    
  } finally {
    // Clean up active request tracking
    activeRequests.delete(requestId);
    
    // Log completion
    const totalTime = Date.now() - startTime;
    logger.info({ 
      host, 
      requestId, 
      totalTime,
      activeRequests: activeRequests.size 
    }, 'Request completed');
  }
}

/**
 * Get comprehensive metrics
 */
function getMetrics() {
  return {
    ...metrics,
    limiters: Array.from(limiters.keys()),
    circuits: Array.from(circuits.entries()).map(([host, circuit]) => ({
      host,
      state: circuit.state,
      failures: circuit.failures,
      halfOpenCalls: circuit.halfOpenCalls,
      successCount: circuit.successCount,
      lastFailureAt: circuit.lastFailureAt,
      openedAt: circuit.openedAt
    })),
    activeRequests: Array.from(activeRequests.values()).map(req => ({
      requestId: req.correlationId,
      host: req.host,
      url: req.url,
      duration: Date.now() - req.startTime
    }))
  };
}

/**
 * Reset all metrics
 */
function resetMetrics() {
  // Reset counters
  Object.keys(metrics).forEach(key => {
    if (typeof metrics[key] === 'object' && metrics[key] !== null) {
      if (Array.isArray(metrics[key])) {
        metrics[key] = [];
      } else {
        Object.keys(metrics[key]).forEach(subKey => {
          if (typeof metrics[key][subKey] === 'number') {
            metrics[key][subKey] = 0;
          } else if (typeof metrics[key][subKey] === 'object') {
            // Special handling for performance.responseTimes array
            if (key === 'performance' && subKey === 'responseTimes') {
              metrics[key][subKey] = [];
            } else {
              metrics[key][subKey] = {};
            }
          }
        });
      }
    } else if (typeof metrics[key] === 'number') {
      metrics[key] = 0;
    }
  });
  
  // Reset active requests
  activeRequests.clear();
}

/**
 * Graceful shutdown - cancel all active requests
 */
async function gracefulShutdown(timeoutMs = 30000) {
  const logger = createLogger();
  logger.info({ 
    activeRequests: activeRequests.size,
    timeoutMs 
  }, 'Starting graceful shutdown');
  
  const shutdownPromise = new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (activeRequests.size === 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    
    // Timeout fallback
    setTimeout(() => {
      clearInterval(checkInterval);
      logger.warn({ 
        remainingRequests: activeRequests.size 
      }, 'Graceful shutdown timeout reached');
      resolve();
    }, timeoutMs);
  });
  
  await shutdownPromise;
  
  // Clean up resources
  limiters.clear();
  circuits.clear();
  activeRequests.clear();
  
  logger.info('Graceful shutdown completed');
}

/**
 * Health check
 */
function getHealthStatus() {
  const now = Date.now();
  const activeRequestCount = activeRequests.size;
  const circuitStates = Array.from(circuits.values());
  const openCircuits = circuitStates.filter(c => c.state === CIRCUIT_STATES.OPEN).length;
  const halfOpenCircuits = circuitStates.filter(c => c.state === CIRCUIT_STATES.HALF_OPEN).length;
  
  return {
    status: activeRequestCount === 0 && openCircuits === 0 ? 'healthy' : 'degraded',
    activeRequests: activeRequestCount,
    circuits: {
      total: circuitStates.length,
      open: openCircuits,
      halfOpen: halfOpenCircuits,
      closed: circuitStates.length - openCircuits - halfOpenCircuits
    },
    metrics: {
      totalRequests: metrics.requests.total,
      successRate: metrics.requests.total > 0 
        ? (metrics.requests.completed / metrics.requests.total * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTime: metrics.performance.averageResponseTimeMs.toFixed(2) + 'ms'
    }
  };
}

module.exports = { 
  fetchWithPolicy, 
  getMetrics, 
  resetMetrics,
  gracefulShutdown,
  getHealthStatus,
  CIRCUIT_STATES
};