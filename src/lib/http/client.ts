import Bottleneck from 'bottleneck';
import { randomUUID } from 'crypto';
import { NetworkError, RateLimitError, TimeoutError, CircuitOpenError } from './errors';
import config from '../config';
import { createLogger } from '../logger';

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  openedAt: number;
}

interface FetchOptions extends RequestInit {
  correlationId?: string;
  retries?: number;
  timeout?: number;
}

// TTL cleanup for memory management
const LIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const limiters = new Map<string, Bottleneck>();
const circuits = new Map<string, CircuitState>();

// Track creation times for TTL cleanup
const limiterTimestamps = new Map<string, number>();
const circuitTimestamps = new Map<string, number>();

// Start cleanup interval
let cleanupInterval: NodeJS.Timeout | null = setInterval(
  cleanupExpiredEntries,
  CLEANUP_INTERVAL_MS
);

function cleanupExpiredEntries(): void {
  const now = Date.now();
  const logger = createLogger('client-cleanup');

  // Clean up expired limiters
  for (const [host, timestamp] of limiterTimestamps.entries()) {
    if (now - timestamp > LIMITER_TTL_MS) {
      const limiter = limiters.get(host);
      if (limiter) {
        // Stop the limiter before removing
        limiter.stop({ dropWaitingJobs: true });
        limiters.delete(host);
        limiterTimestamps.delete(host);
        logger.info(`Cleaned up expired limiter for host: ${host}`, { host });
      }
    }
  }

  // Clean up expired circuits
  for (const [host, timestamp] of circuitTimestamps.entries()) {
    if (now - timestamp > CIRCUIT_TTL_MS) {
      circuits.delete(host);
      circuitTimestamps.delete(host);
      logger.info(`Cleaned up expired circuit for host: ${host}`, { host });
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

function getLimiter(host: string): Bottleneck {
  if (!limiters.has(host)) {
    const limiter = new Bottleneck({
      maxConcurrent: config.MAX_CONCURRENCY,
      reservoir: config.RATE_LIMIT_PER_SEC,
      reservoirRefreshAmount: config.RATE_LIMIT_PER_SEC,
      reservoirRefreshInterval: 1000,
    });
    limiters.set(host, limiter);
    limiterTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    limiterTimestamps.set(host, Date.now());
  }
  return limiters.get(host)!;
}

function getCircuit(host: string): CircuitState {
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
  return circuits.get(host)!;
}

export async function fetchWithPolicy(
  input: string | URL | Request,
  opts: FetchOptions = {}
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? new URL(input)
      : new URL((input as Request).url || (input as URL).href);
  const host = url.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = opts.correlationId || randomUUID();
  const logger = createLogger('http-client', correlationId).child({ host, url: url.toString() });

  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
    } else {
      throw new CircuitOpenError(`Circuit for ${host} is open`, { host });
    }
  }

  const maxRetries = opts.retries ?? config.MAX_RETRIES;
  const timeout = opts.timeout ?? config.DEFAULT_TIMEOUT_MS;

  const attemptFetch = async (attempt: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = { ...(opts.headers || {}), 'x-correlation-id': correlationId };

    try {
      logger.info('outbound request', { attempt });
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
      if (err instanceof Error && err.name === 'AbortError') {
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
      throw new NetworkError(err instanceof Error ? err.message : 'Unknown error', { cause: err });
    } finally {
      clearTimeout(timer);
    }
  };

  let attempt = 0;
  while (true) {
    try {
      return await limiter.schedule(() => attemptFetch(attempt + 1));
    } catch (err) {
      if (err instanceof CircuitOpenError || err instanceof TimeoutError || attempt >= maxRetries) {
        throw err;
      }
      attempt++;
      const backoff = Math.min(100 * 2 ** attempt, 1000);
      const jitter = Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, backoff + jitter));
    }
  }
}
