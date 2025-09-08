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

function getLimiter(host) {
  if (!limiters.has(host)) {
    const limiter = new Bottleneck({
      maxConcurrent: config.MAX_CONCURRENCY,
      reservoir: config.RATE_LIMIT_PER_SEC,
      reservoirRefreshAmount: config.RATE_LIMIT_PER_SEC,
      reservoirRefreshInterval: 1000,
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
    });
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
    const headers = { ...(opts.headers || {}), 'x-correlation-id': correlationId };
    try {
      logger.info({ attempt }, 'outbound request');
      const res = await fetch(url.toString(), { ...opts, headers, signal: controller.signal });
      if (res.status === 429) {
        throw new RateLimitError('Upstream 429', { status: res.status });
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
      if (err instanceof RateLimitError || err instanceof NetworkError) {
        circuit.failures++;
        if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
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
      if (
        err instanceof CircuitOpenError ||
        err instanceof TimeoutError ||
        attempt >= maxRetries
      ) {
        throw err;
      }
      attempt++;
      const backoff = Math.min(100 * 2 ** attempt, 1000);
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
}

module.exports = { fetchWithPolicy };
