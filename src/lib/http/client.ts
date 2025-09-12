import Bottleneck from 'bottleneck';
import { randomUUID } from 'crypto';
import config from '../config';
import { NetworkError, RateLimitError, TimeoutError, CircuitOpenError } from './errors';
import { createLogger } from '../logger';

type Host = string;

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  openedAt: number;
  halfOpenCalls: number;
}

interface FetchOptions extends RequestInit {
  correlationId?: string;
  retries?: number;
  timeout?: number;
}

interface Metrics {
  requests: {
    total: number;
    byHost: Record<string, number>;
    byStatus: Record<number, number>;
  };
  rateLimits: {
    hits: number;
    byHost: Record<string, number>;
  };
  retries: {
    scheduled: number;
    byReason: Record<string, number>;
  };
  circuitBreaker: {
    stateChanges: number;
    byHost: Record<string, number>;
  };
  deferrals: {
    count: number;
    byHost: Record<string, number>;
  };
}

// TTL cleanup for memory management
const LIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const limiters = new Map<Host, Bottleneck>();
const circuits = new Map<Host, CircuitState>();

// Track creation times for TTL cleanup
const limiterTimestamps = new Map<Host, number>();
const circuitTimestamps = new Map<Host, number>();

// Metrics tracking
const metrics: Metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} },
};

// Start cleanup interval
const cleanupInterval: NodeJS.Timeout | null = setInterval(
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

function getHostLimits(host: string) {
  return config.HOST_LIMITS[host] || config.HOST_LIMITS.default;
}

function getLimiter(host: string): Bottleneck {
  if (!limiters.has(host)) {
    const limits = getHostLimits(host);
    const limiter = new Bottleneck({
      maxConcurrent: 1,
      reservoir: limits.burst,
      reservoirRefreshAmount: limits.burst,
      reservoirRefreshInterval: 1000 / limits.rps,
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
      halfOpenCalls: 0,
    });
    circuitTimestamps.set(host, Date.now());
  } else {
    // Update timestamp on access to extend TTL
    circuitTimestamps.set(host, Date.now());
  }
  return circuits.get(host)!;
}

function updateMetrics(
  type: string,
  host: string,
  status: number | null = null,
  reason: string | null = null
) {
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
      if (reason) {
        metrics.retries.byReason[reason] = (metrics.retries.byReason[reason] || 0) + 1;
      }
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

function calculateBackoff(attempt: number, retryAfter: number | null = null): number {
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

function shouldOpenCircuit(failures: number): boolean {
  return failures >= config.CIRCUIT_BREAKER_THRESHOLD;
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

  // Check circuit breaker state
  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > config.CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
      circuit.halfOpenCalls = 0;
      updateMetrics('circuitChange', host);
      logger.info('Circuit breaker moved to half-open state', { host });
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

  const attemptFetch = async (attempt: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers = {
      'User-Agent': 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'x-correlation-id': correlationId,
      ...(opts.headers || {}),
    };

    try {
      logger.info('outbound request', { attempt, host });

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

        logger.warn('Rate limited - will retry', {
          status: res.status,
          retryAfter: retryAfterSeconds,
          attempt,
        });

        // If we have retries left, schedule a retry
        if (attempt < maxRetries) {
          const delay = calculateBackoff(attempt, retryAfterSeconds);
          logger.info('Scheduling retry for 429', { delay, attempt });
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
        if (shouldOpenCircuit(circuit.failures)) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
          logger.error('Circuit breaker opened', { host, failures: circuit.failures });
        }
        throw new NetworkError(`Upstream ${res.status}`, { status: res.status });
      }

      // Success - reset circuit breaker
      if (circuit.state !== 'closed') {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.halfOpenCalls = 0;
        updateMetrics('circuitChange', host);
        logger.info('Circuit breaker closed', { host });
      }

      return res;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        circuit.failures++;
        if (shouldOpenCircuit(circuit.failures)) {
          circuit.state = 'open';
          circuit.openedAt = Date.now();
          updateMetrics('circuitChange', host);
        }
        throw new TimeoutError('Request timed out', { timeout });
      }

      // Only count network errors and 5xx as circuit breaker failures
      if (err instanceof NetworkError) {
        circuit.failures++;
        if (shouldOpenCircuit(circuit.failures)) {
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
      logger.info('Retrying after error', { attempt, backoff, error: (err as Error).message });
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}

export function getMetrics() {
  return {
    ...metrics,
    limiters: Array.from(limiters.keys()),
    circuits: Array.from(circuits.entries()).map(([host, circuit]) => ({
      host,
      state: circuit.state,
      failures: circuit.failures,
    })),
  };
}

export function resetMetrics() {
  Object.keys(metrics).forEach(key => {
    const metricKey = key as keyof Metrics;
    if (typeof metrics[metricKey] === 'object' && metrics[metricKey] !== null) {
      const obj = metrics[metricKey] as any;
      Object.keys(obj).forEach(subKey => {
        if (typeof obj[subKey] === 'number') {
          obj[subKey] = 0;
        } else if (typeof obj[subKey] === 'object') {
          obj[subKey] = {};
        }
      });
    }
  });
}
