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

// PFR-specific recovery strategy
const PFR_RECOVERY_STRATEGY = {
  initialResetTime: 60000, // 60 seconds
  maxResetTime: 300000,    // 5 minutes
  backoffMultiplier: 2,
  probeRequestPath: '/robots.txt', // Low-impact probe
  maxResetAttempts: 5
};

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
    circuits.set(host, {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      halfOpenCalls: 0,
      resetAttempts: 0,
      lastProbeAt: 0,
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

function calculateCircuitResetTime(host, resetAttempts) {
  // Use exponential backoff for circuit reset times, especially for PFR
  const isPFR = host === 'www.pro-football-reference.com';
  const strategy = isPFR ? PFR_RECOVERY_STRATEGY : {
    initialResetTime: config.CIRCUIT_BREAKER_RESET_MS,
    maxResetTime: config.CIRCUIT_BREAKER_RESET_MS * 4,
    backoffMultiplier: 1.5,
    maxResetAttempts: 3
  };
  
  const resetTime = Math.min(
    strategy.initialResetTime * Math.pow(strategy.backoffMultiplier, resetAttempts),
    strategy.maxResetTime
  );
  
  return resetTime;
}

async function performProbeRequest(host, url, opts, logger) {
  // Perform a low-impact probe request to test if the circuit should close
  const isPFR = host === 'www.pro-football-reference.com';
  const probeUrl = isPFR 
    ? `https://${host}${PFR_RECOVERY_STRATEGY.probeRequestPath}`
    : `https://${host}/`;
  
  try {
    logger.info({ host, probeUrl }, 'Performing circuit probe request');
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000); // Short timeout for probe
    
    const response = await fetch(probeUrl, {
      method: 'HEAD', // Use HEAD to minimize impact
      headers: {
        'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
        'x-correlation-id': opts.correlationId || 'probe-request'
      },
      signal: controller.signal
    });
    
    clearTimeout(timer);
    
    // Consider 2xx and 3xx as successful probes
    const success = response.status < 400;
    logger.info({ 
      host, 
      probeUrl, 
      status: response.status, 
      success 
    }, 'Circuit probe completed');
    
    return success;
  } catch (err) {
    logger.warn({ host, probeUrl, error: err.message }, 'Circuit probe failed');
    return false;
  }
}

async function fetchWithPolicy(input, opts = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
  const host = url.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });

  // Check circuit breaker state with enhanced recovery logic
  if (circuit.state === 'open') {
    const resetTime = calculateCircuitResetTime(host, circuit.resetAttempts);
    const timeSinceOpen = Date.now() - circuit.openedAt;
    
    if (timeSinceOpen > resetTime) {
      // Move to half-open and perform probe request
      const isPFR = host === 'www.pro-football-reference.com';
      const strategy = isPFR ? PFR_RECOVERY_STRATEGY : { maxResetAttempts: 3 };
      
      if (circuit.resetAttempts >= strategy.maxResetAttempts) {
        logger.error({ 
          host, 
          resetAttempts: circuit.resetAttempts, 
          maxAttempts: strategy.maxResetAttempts 
        }, 'Circuit breaker maximum reset attempts exceeded');
        throw new CircuitOpenError(`Circuit for ${host} has exceeded maximum reset attempts`, { host });
      }
      
      // Perform probe request before transitioning to half-open
      const probeSuccess = await performProbeRequest(host, url, opts, logger);
      
      if (probeSuccess) {
        circuit.state = 'half-open';
        circuit.halfOpenCalls = 0;
        circuit.lastProbeAt = Date.now();
        updateMetrics('circuitChange', host);
        logger.info({ host, resetAttempts: circuit.resetAttempts }, 'Circuit breaker moved to half-open state after successful probe');
      } else {
        circuit.resetAttempts++;
        circuit.openedAt = Date.now(); // Reset the timer for next attempt
        updateMetrics('circuitChange', host);
        logger.warn({ 
          host, 
          resetAttempts: circuit.resetAttempts,
          nextResetIn: calculateCircuitResetTime(host, circuit.resetAttempts)
        }, 'Circuit probe failed, extending open state');
        throw new CircuitOpenError(`Circuit for ${host} probe failed, remaining open`, { host });
      }
    } else {
      const remainingTime = resetTime - timeSinceOpen;
      updateMetrics('circuitChange', host);
      throw new CircuitOpenError(`Circuit for ${host} is open (${Math.ceil(remainingTime/1000)}s remaining)`, { 
        host, 
        remainingTimeMs: remainingTime 
      });
    }
  }

  if (circuit.state === 'half-open') {
    if (circuit.halfOpenCalls >= config.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS) {
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
        circuit.resetAttempts = 0; // Reset the exponential backoff counter
        updateMetrics('circuitChange', host);
        logger.info({ host }, 'Circuit breaker closed - all counters reset');
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
      failures: circuit.failures,
      resetAttempts: circuit.resetAttempts,
      openedAt: circuit.openedAt,
      lastProbeAt: circuit.lastProbeAt,
      nextResetIn: circuit.state === 'open' 
        ? Math.max(0, calculateCircuitResetTime(host, circuit.resetAttempts) - (Date.now() - circuit.openedAt))
        : 0
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
  resetMetrics
};