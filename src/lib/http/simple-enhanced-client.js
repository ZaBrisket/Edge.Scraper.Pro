const AdaptiveRateLimiter = require('./adaptive-rate-limiter');
const { randomUUID } = require('crypto');
const { NetworkError, RateLimitError, TimeoutError, CircuitOpenError } = require('./errors');
const config = require('../config');
const createLogger = require('./logging');

// Initialize global adaptive rate limiter
const adaptiveRateLimiter = new AdaptiveRateLimiter();

// Listen to metrics for logging (optional)
adaptiveRateLimiter.on('metrics', (metrics) => {
  if (process.env.DEBUG_RATE_LIMITER === 'true') {
    console.log('[RateLimiter Metrics]', JSON.stringify(metrics, null, 2));
  }
});

// Simplified enhanced client for testing
const circuits = new Map();
const metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} },
};

// Removed getHostLimits and getLimiter - now handled by AdaptiveRateLimiter

function getCircuit(host) {
  if (!circuits.has(host)) {
    circuits.set(host, {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      halfOpenCalls: 0,
    });
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
    const baseDelay = Math.min(retryAfter * 1000, config.MAX_BACKOFF_MS);
    const jitter = Math.random() * baseDelay * config.JITTER_FACTOR;
    return baseDelay + jitter;
  }

  const baseDelay = Math.min(
    config.BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
    config.MAX_BACKOFF_MS
  );
  const jitter = Math.random() * baseDelay * config.JITTER_FACTOR;
  return baseDelay + jitter;
}

async function fetchWithPolicy(input, opts = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
  const host = url.host;
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });

  // Check circuit breaker state
  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
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
    if (circuit.halfOpenCalls >= config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
      throw new CircuitOpenError(`Circuit for ${host} is half-open and call limit reached`, {
        host,
      });
    }
    circuit.halfOpenCalls++;
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.READ_TIMEOUT_MS;

  const attemptFetch = async attempt => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers = {
      'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'x-correlation-id': correlationId,
      ...(opts.headers || {}),
    };

    try {
      logger.info({ attempt, host }, 'outbound request');

      const res = await fetch(url.toString(), {
        ...opts,
        headers,
        signal: controller.signal,
      });

      updateMetrics('request', host, res.status);

      // Handle 429 responses specially - DO NOT count as circuit breaker failure
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;

        updateMetrics('rateLimit', host);
        updateMetrics('deferral', host);

        logger.warn(
          {
            status: res.status,
            retryAfter: retryAfterSeconds,
            attempt,
          },
          'Rate limited - will retry'
        );

        // If we have retries left, schedule a retry
        if (attempt < maxRetries) {
          const delay = calculateBackoff(attempt, retryAfterSeconds);
          logger.info({ delay, attempt }, 'Scheduling retry for 429');
          await new Promise(resolve => setTimeout(resolve, delay));
          return await attemptFetch(attempt + 1);
        } else {
          throw new RateLimitError('Rate limit exceeded after retries', {
            status: res.status,
            retryAfter: retryAfterSeconds,
            attempts: attempt,
          });
        }
      }

      // Handle 5xx responses - these count toward circuit breaker
      if (res.status >= 500) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
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
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
        }
        throw new TimeoutError('Request timed out', { timeout });
      }

      // Only count network errors and 5xx as circuit breaker failures
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
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

  // Acquire token from adaptive rate limiter before making request
  const tokenInfo = await adaptiveRateLimiter.acquireToken(host);
  logger.info({ tokenInfo }, 'Acquired rate limit token');
  
  let attempt = 0;
  while (true) {
    try {
      const result = await attemptFetch(attempt + 1);
      
      // Feed response back to rate limiter for learning
      adaptiveRateLimiter.handleResponse(host, result);
      
      return result;
    } catch (err) {
      // Report errors to rate limiter
      if (err.status) {
        adaptiveRateLimiter.handleResponse(host, { status: err.status });
      }
      
      if (
        err instanceof CircuitOpenError ||
        err instanceof TimeoutError ||
        err instanceof RateLimitError ||
        attempt >= maxRetries
      ) {
        throw err;
      }

      attempt++;
      const backoff = calculateBackoff(attempt);
      logger.info({ attempt, backoff, error: err.message }, 'Retrying after error');
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}

function getMetrics() {
  return {
    ...metrics,
    rateLimiter: adaptiveRateLimiter.getMetrics(),
    circuits: Array.from(circuits.entries()).map(([host, circuit]) => ({
      host,
      state: circuit.state,
      failures: circuit.failures,
    })),
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

// Simple wrapper for compatibility
async function fetchWithEnhancedClient(url, options = {}) {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  
  // Acquire token from adaptive rate limiter
  const tokenInfo = await adaptiveRateLimiter.acquireToken(hostname);
  
  try {
    // Set timeout
    const timeout = options.timeout || parseInt(process.env.HTTP_DEADLINE_MS) || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const fetchOptions = {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        'User-Agent': options.headers?.['User-Agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // Feed response back to rate limiter for learning
    adaptiveRateLimiter.handleResponse(hostname, response);
    
    // Handle 429 specifically
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(`Rate limited: ${response.status} ${response.statusText}`);
      error.code = 'RATE_LIMITED';
      error.status = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
    
    return response;
    
  } catch (error) {
    // Report errors to rate limiter
    if (error.code !== 'RATE_LIMITED') {
      adaptiveRateLimiter.handleResponse(hostname, {
        status: error.code === 'ECONNREFUSED' ? 503 : 500
      });
    }
    throw error;
  }
}

module.exports = {
  fetchWithPolicy,
  fetchWithEnhancedClient,
  getMetrics,
  resetMetrics,
};
