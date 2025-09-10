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
    const { rps, burst, concurrency } = config.getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: concurrency,
      reservoir: Math.max(Math.ceil(burst), Math.ceil(rps)),
      reservoirRefreshAmount: Math.ceil(rps),
      reservoirRefreshInterval: 1000,
      trackDoneStatus: true,
    });
    limiters.set(host, limiter);
    limiterTimestamps.set(host, Date.now());
    metrics.setGauge('rate_limit.config', { host, rps, burst, concurrency }, 1);
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
  metrics.incCounter('http.requests', { host, phase: 'start' }, 1);

  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
      metrics.incCounter('circuit.state', { host, state: 'half_open' }, 1);
    } else {
      metrics.incCounter('circuit.state', { host, state: 'open_block' }, 1);
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { ...(opts.headers || {}), 'x-correlation-id': correlationId };
    try {
      logger.info({ attempt }, 'outbound request');
      const res = await fetch(url.toString(), { ...opts, headers, signal: controller.signal });
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        const retryAfterMs = parseRetryAfterMs(retryAfter);
        metrics.incCounter('rate_limit.hit', { host }, 1);
        throw new RateLimitError('Upstream 429', { status: res.status, retryAfterMs });
      }
      if (res.status >= 500) {
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      // Success
      circuit.failures = 0;
      circuit.state = 'closed';
      metrics.incCounter('circuit.state', { host, state: 'close' }, 1);
      metrics.incCounter('http.requests', { host, status_class: `${Math.floor(res.status/100)}xx` }, 1);
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.incCounter('circuit.state', { host, state: 'open' }, 1);
        }
        throw new TimeoutError('Request timed out', { timeout });
      }
      if (err instanceof RateLimitError) {
        // Do NOT count 429s toward circuit failures
        metrics.incCounter('http.requests', { host, status_class: '4xx', status: 429 }, 1);
        throw err;
      }
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.incCounter('circuit.state', { host, state: 'open' }, 1);
        }
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
      if (err instanceof CircuitOpenError || err instanceof TimeoutError) {
        throw err;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
      attempt++;
      let delayMs;
      if (err instanceof RateLimitError) {
        const base = err.meta && typeof err.meta.retryAfterMs === 'number' ? err.meta.retryAfterMs : undefined;
        const expo = Math.min(1000 * 2 ** (attempt - 1), 15000);
        const jitter = Math.floor(Math.random() * 500);
        delayMs = (base || expo) + jitter;
        metrics.incCounter('429.deferred', { host }, 1);
        metrics.incCounter('retry.scheduled', { host, reason: '429' }, 1);
      } else {
        const expo = Math.min(300 * 2 ** (attempt - 1), 5000);
        const jitter = Math.floor(Math.random() * 200);
        delayMs = expo + jitter;
        metrics.incCounter('retry.scheduled', { host, reason: '5xx_or_network' }, 1);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function parseRetryAfterMs(header) {
  if (!header) return undefined;
  const asNum = Number(header);
  if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

module.exports = { fetchWithPolicy };
