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
    // Use host-specific limits if available
  const hostLimits = config.HOST_LIMITS && config.HOST_LIMITS[host] 
    ? config.HOST_LIMITS[host] 
    : (config.HOST_LIMITS && config.HOST_LIMITS.default 
      ? config.HOST_LIMITS.default 
      : { rps: config.RATE_LIMIT_PER_SEC, burst: config.RATE_LIMIT_PER_SEC });
      
  const limiter = new Bottleneck({
      maxConcurrent: 1, // Conservative concurrency
      reservoir: hostLimits.burst,
      reservoirRefreshAmount: hostLimits.burst,
      reservoirRefreshInterval: Math.max(1000 / hostLimits.rps, 100), // Minimum 100ms interval
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
    });
    circuitTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    circuitTimestamps.set(host, Date.now());
  }
  return circuits.get(host);
}

async function fetchWithPolicy(input, opts = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
  const host = url.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger(correlationId).child({ host, url: url.toString() });

  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
    } else {
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { 
      'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'x-correlation-id': correlationId,
      ...(opts.headers || {})
    };
    try {
      logger.info({ attempt }, 'outbound request');
      const res = await fetch(url.toString(), { ...opts, headers, signal: controller.signal });
      // Handle 429 responses specially - DO NOT count as circuit breaker failure
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
        
        logger.warn({
          status: res.status,
          retryAfter: retryAfterSeconds,
          attempt
        }, 'Rate limited - will retry with backoff');
        
        throw new RateLimitError('Upstream 429', { 
          status: res.status, 
          retryAfter: retryAfterSeconds 
        });
      }
      if (res.status >= 500) {
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      // Success
      circuit.failures = 0;
      circuit.state = 'closed';
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
        }
        throw new TimeoutError('Request timed out', { timeout });
      }
      // Only count NetworkError (5xx) toward circuit breaker, NOT RateLimitError (429)
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
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
      
      attempt++;
      let backoff;
      
      // Handle 429 rate limit errors with special backoff logic
      if (err instanceof RateLimitError && err.meta.retryAfter) {
        // Use Retry-After header value with some jitter
        const retryAfterMs = err.meta.retryAfter * 1000;
        const jitter = Math.random() * retryAfterMs * 0.1; // 10% jitter
        backoff = Math.min(retryAfterMs + jitter, config.MAX_BACKOFF_MS || 30000);
        logger.info({ 
          attempt, 
          retryAfter: err.meta.retryAfter, 
          backoff, 
          error: err.message 
        }, 'Retrying after rate limit with Retry-After header');
      } else if (err instanceof RateLimitError) {
        // Exponential backoff for 429 without Retry-After header
        const baseDelay = Math.min(config.BASE_BACKOFF_MS || 2000, 2000);
        backoff = Math.min(baseDelay * Math.pow(2, attempt - 1), config.MAX_BACKOFF_MS || 30000);
        const jitter = Math.random() * backoff * 0.1;
        backoff = backoff + jitter;
        logger.info({ 
          attempt, 
          backoff, 
          error: err.message 
        }, 'Retrying after rate limit with exponential backoff');
      } else {
        // Standard exponential backoff for other errors
        backoff = Math.min(100 * Math.pow(2, attempt), 2000);
        const jitter = Math.random() * 100;
        backoff = backoff + jitter;
        logger.info({ 
          attempt, 
          backoff, 
          error: err.message 
        }, 'Retrying after error');
      }
      
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

module.exports = { fetchWithPolicy };
