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

// Simplified enhanced client for testing
const limiters = new Map();
const circuits = new Map();
const metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} }
};

// PFR-specific recovery strategy with exponential backoff
const HOST_RECOVERY_STRATEGIES = {
  'www.pro-football-reference.com': {
    initialResetTime: 60000,     // 60 seconds
    maxResetTime: 300000,        // 5 minutes
    backoffMultiplier: 2,
    probeRequestPath: '/robots.txt',
    halfOpenProbeLimit: 1        // Only allow 1 probe request in half-open state
  },
  'www.baseball-reference.com': {
    initialResetTime: 60000,
    maxResetTime: 300000,
    backoffMultiplier: 2,
    probeRequestPath: '/robots.txt',
    halfOpenProbeLimit: 1
  },
  'www.basketball-reference.com': {
    initialResetTime: 60000,
    maxResetTime: 300000,
    backoffMultiplier: 2,
    probeRequestPath: '/robots.txt',
    halfOpenProbeLimit: 1
  },
  'www.hockey-reference.com': {
    initialResetTime: 60000,
    maxResetTime: 300000,
    backoffMultiplier: 2,
    probeRequestPath: '/robots.txt',
    halfOpenProbeLimit: 1
  },
  default: {
    initialResetTime: config.CIRCUIT_BREAKER_RESET_MS || 30000,
    maxResetTime: 120000,
    backoffMultiplier: 1.5,
    probeRequestPath: null,
    halfOpenProbeLimit: config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS || 3
  }
};

function getHostLimits(host) {
  return config.HOST_LIMITS[host] || config.HOST_LIMITS.default;
}

function getLimiter(host) {
  if (!limiters.has(host)) {
    const limits = getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: 1,
      reservoir: limits.burst,
      reservoirRefreshAmount: limits.burst,
      reservoirRefreshInterval: 1000 / limits.rps,
    });
    limiters.set(host, limiter);
  }
  return limiters.get(host);
}

function getCircuit(host) {
  if (!circuits.has(host)) {
    const strategy = getRecoveryStrategy(host);
    circuits.set(host, {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      halfOpenCalls: 0,
      resetTime: strategy.initialResetTime,
      consecutiveOpenings: 0,
      lastSuccessfulRequest: Date.now(),
      strategy: strategy
    });
  }
  return circuits.get(host);
}

function getRecoveryStrategy(host) {
  return HOST_RECOVERY_STRATEGIES[host] || HOST_RECOVERY_STRATEGIES.default;
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
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });

  // Check circuit breaker state
  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > circuit.resetTime) {
      circuit.state = 'half-open';
      circuit.halfOpenCalls = 0;
      updateMetrics('circuitChange', host);
      logger.info({ 
        host, 
        resetTime: circuit.resetTime,
        consecutiveOpenings: circuit.consecutiveOpenings 
      }, 'Circuit breaker moved to half-open state');
    } else {
      updateMetrics('circuitChange', host);
      const remainingTime = Math.ceil((circuit.resetTime - (Date.now() - circuit.openedAt)) / 1000);
      throw new CircuitOpenError(`Circuit for ${host} is open. Will retry in ${remainingTime}s`, { 
        host,
        remainingTime,
        resetTime: circuit.resetTime
      });
    }
  }

  if (circuit.state === 'half-open') {
    const halfOpenLimit = circuit.strategy.halfOpenProbeLimit;
    
    // For hosts with probe paths, only allow probe requests in half-open state
    if (circuit.strategy.probeRequestPath && !url.pathname.endsWith(circuit.strategy.probeRequestPath)) {
      // If this isn't a probe request and we have a probe path defined, make it a probe request
      if (circuit.halfOpenCalls === 0) {
        // Redirect first half-open request to probe path
        const probeUrl = new URL(circuit.strategy.probeRequestPath, url.origin);
        logger.info({ host, probeUrl: probeUrl.toString() }, 'Redirecting to probe URL for half-open validation');
        url = probeUrl;
      } else {
        // Already made probe request, circuit should be closed or open by now
        throw new CircuitOpenError(`Circuit for ${host} is still in half-open state after probe`, { host });
      }
    }
    
    if (circuit.halfOpenCalls >= halfOpenLimit) {
      throw new CircuitOpenError(`Circuit for ${host} is half-open and call limit reached`, { host });
    }
    circuit.halfOpenCalls++;
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.READ_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    
    const headers = {
      'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'x-correlation-id': correlationId,
      ...(opts.headers || {})
    };

    try {
      logger.info({ attempt, host }, 'outbound request');
      
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
          const delay = calculateBackoff(attempt, retryAfterSeconds);
          logger.info({ delay, attempt }, 'Scheduling retry for 429');
          await new Promise(resolve => setTimeout(resolve, delay));
          return await attemptFetch(attempt + 1);
        } else {
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
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          openCircuitBreaker(circuit, host, logger);
        }
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      
      // Success - reset circuit breaker
      if (circuit.state !== 'closed') {
        closeCircuitBreaker(circuit, host, logger);
      }
      
      circuit.lastSuccessfulRequest = Date.now();
      
      return res;
      
    } catch (err) {
      if (err.name === 'AbortError') {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          openCircuitBreaker(circuit, host, logger);
        }
        throw new TimeoutError('Request timed out', { timeout });
      }
      
      // Only count network errors and 5xx as circuit breaker failures
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          openCircuitBreaker(circuit, host, logger);
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
        err instanceof RateLimitError ||
        attempt >= maxRetries
      ) {
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

/**
 * Open circuit breaker with exponential backoff
 */
function openCircuitBreaker(circuit, host, logger) {
  circuit.state = 'open';
  circuit.openedAt = Date.now();
  circuit.consecutiveOpenings++;
  
  // Calculate exponential backoff for reset time
  const strategy = circuit.strategy;
  const newResetTime = Math.min(
    circuit.resetTime * strategy.backoffMultiplier,
    strategy.maxResetTime
  );
  circuit.resetTime = newResetTime;
  
  updateMetrics('circuitChange', host);
  logger.error({ 
    host, 
    failures: circuit.failures,
    consecutiveOpenings: circuit.consecutiveOpenings,
    resetTime: circuit.resetTime,
    nextResetInSeconds: circuit.resetTime / 1000
  }, 'Circuit breaker opened with exponential backoff');
}

/**
 * Close circuit breaker and reset counters
 */
function closeCircuitBreaker(circuit, host, logger) {
  const wasHalfOpen = circuit.state === 'half-open';
  circuit.state = 'closed';
  circuit.failures = 0;
  circuit.halfOpenCalls = 0;
  
  // Reset exponential backoff on successful recovery
  if (wasHalfOpen) {
    circuit.consecutiveOpenings = 0;
    circuit.resetTime = circuit.strategy.initialResetTime;
  }
  
  updateMetrics('circuitChange', host);
  logger.info({ 
    host,
    wasHalfOpen,
    resetTimeRestored: circuit.resetTime / 1000
  }, 'Circuit breaker closed successfully');
}

/**
 * Get circuit state for monitoring
 */
function getCircuitStates() {
  const states = {};
  circuits.forEach((circuit, host) => {
    states[host] = {
      state: circuit.state,
      failures: circuit.failures,
      consecutiveOpenings: circuit.consecutiveOpenings,
      resetTime: circuit.resetTime,
      timeUntilReset: circuit.state === 'open' 
        ? Math.max(0, circuit.resetTime - (Date.now() - circuit.openedAt))
        : 0,
      lastSuccessfulRequest: circuit.lastSuccessfulRequest,
      strategy: {
        type: circuit.strategy === HOST_RECOVERY_STRATEGIES.default ? 'default' : 'custom',
        halfOpenProbeLimit: circuit.strategy.halfOpenProbeLimit,
        probeRequestPath: circuit.strategy.probeRequestPath
      }
    };
  });
  return states;
}

module.exports = { 
  fetchWithPolicy, 
  getMetrics, 
  resetMetrics,
  getCircuitStates
};