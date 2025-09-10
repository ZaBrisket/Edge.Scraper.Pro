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
    const hl = config.getHostLimit(host);
    const limiter = new Bottleneck({
      maxConcurrent: hl.concurrency,
      reservoir: hl.burst,
      reservoirRefreshAmount: hl.rps,
      reservoirRefreshInterval: 1000,
      // Smooth spikes: carryover concurrency and penalty for retries
      trackDoneStatus: true,
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
      probeInFlight: false,
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
      metrics.inc('circuit.state', 1, { host, state: 'half_open' });
    } else {
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }
  if (circuit.state === 'half-open') {
    if (circuit.probeInFlight) {
      throw new CircuitOpenError(`Circuit for ${host} is half-open (probe in flight)`, { host });
    }
    circuit.probeInFlight = true;
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;

  const attemptFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { ...(opts.headers || {}), 'x-correlation-id': correlationId };
    try {
      logger.info({ attempt }, 'outbound request');
      const res = await fetch(url.toString(), { ...opts, headers: { 'User-Agent': config.USER_AGENT, ...headers }, signal: controller.signal });
      metrics.inc('http.requests', 1, { host, status_class: Math.floor(res.status / 100) + 'xx' });
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        metrics.inc('rate_limit.hit', 1, { host });
        throw new RateLimitError('Upstream 429', { status: res.status, retryAfter });
      }
      if (res.status >= 500) {
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }
      // Success
      circuit.failures = 0;
      if (circuit.state !== 'closed') {
        metrics.inc('circuit.state', 1, { host, state: 'close' });
      }
      circuit.state = 'closed';
      circuit.probeInFlight = false;
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.inc('circuit.state', 1, { host, state: 'open' });
        }
        circuit.probeInFlight = false;
        throw new TimeoutError('Request timed out', { timeout });
      }
      if (err instanceof RateLimitError) {
        // Do NOT count 429 towards circuit failures
        circuit.probeInFlight = false;
        throw err;
      }
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          metrics.inc('circuit.state', 1, { host, state: 'open' });
        }
        circuit.probeInFlight = false;
        throw err;
      }
      circuit.probeInFlight = false;
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
      let delayMs;
      if (err instanceof RateLimitError) {
        // Honor Retry-After when provided, else exponential backoff with full jitter
        if (typeof err.meta?.retryAfter === 'number') {
          delayMs = err.meta.retryAfter;
        } else {
          const base = Math.min(1000 * 2 ** (attempt - 1), 15000);
          delayMs = Math.floor(Math.random() * base); // full jitter
        }
        metrics.inc('429.deferred', 1, { host });
      } else {
        const base = Math.min(200 * 2 ** attempt, 2000);
        delayMs = base + Math.floor(Math.random() * 200);
      }
      logger.warn({ attempt, delayMs, reason: err.code || err.name }, 'retry scheduled');
      metrics.inc('retry.scheduled', 1, { host, reason: err.code || err.name });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

module.exports = { fetchWithPolicy };

function parseRetryAfter(value) {
  if (!value) return null;
  // Can be seconds or HTTP-date
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const t = Date.parse(value);
  if (Number.isFinite(t)) return Math.max(0, t - Date.now());
  return null;
}
