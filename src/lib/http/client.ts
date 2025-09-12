// src/lib/http/client.ts
import Bottleneck from 'bottleneck';
import { randomUUID } from 'crypto';
import config from '../config';
import { NetworkError, RateLimitError, TimeoutError, CircuitOpenError } from './errors';
import createLogger from './logging';

type Host = string;
const logger = createLogger('http');

const limiters = new Map<Host, Bottleneck>();
const circuits = new Map<Host, { state:'closed'|'open'|'half-open', failures:number, openedAt:number, halfOpenCalls:number }>();
const metrics = {
  requests: { total: 0, byHost: {} as Record<string, number>, byStatus: {} as Record<string, number> },
  rateLimits: { hits: 0, byHost: {} as Record<string, number> },
  retries: { scheduled: 0, byReason: {} as Record<string, number> },
  circuitBreaker: { stateChanges: 0, byHost: {} as Record<string, number> },
  deferrals: { count: 0, byHost: {} as Record<string, number> },
};

function getHostLimits(host: string) {
  return config.HOST_LIMITS[host] || config.HOST_LIMITS.default;
}

function getLimiter(host: string) {
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
  return limiters.get(host)!;
}

function getCircuit(host: string) {
  if (!circuits.has(host)) {
    circuits.set(host, {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      halfOpenCalls: 0,
    });
  }
  return circuits.get(host)!;
}

function updateMetrics(type: string, host: string, status?: number, reason?: string) {
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
      metrics.retries.byReason[reason || 'unknown'] = (metrics.retries.byReason[reason || 'unknown'] || 0) + 1;
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

function calculateBackoff(attempt: number, retryAfter?: number | null) {
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

function shouldOpenCircuit(circuit: { failures: number }, threshold: number) {
  return circuit.failures >= threshold;
}

export async function fetchWithPolicy(input: RequestInfo, opts: RequestInit = {}) {
  const url = typeof input === 'string' ? new URL(input) : new URL((input as any).url || (input as any).href || '');
  const host = url.host;
  const limiter = getLimiter(host);
  const circuit = getCircuit(host);
  const correlationId = (opts as any).correlationId || randomUUID();
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

  const maxRetries = (opts as any).retries ?? config.MAX_RETRIES;
  const timeout = (opts as any).timeout ?? config.READ_TIMEOUT_MS;

  const attemptFetch = async (attempt: number) => {
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
      if (err instanceof Error && err.name === 'AbortError') {
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
      logger.info({ attempt, backoff, error: err instanceof Error ? err.message : 'Unknown error' }, 'Retrying after error');
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
    if (typeof metrics[key as keyof typeof metrics] === 'object' && metrics[key as keyof typeof metrics] !== null) {
      if (Array.isArray(metrics[key as keyof typeof metrics])) {
        (metrics[key as keyof typeof metrics] as any) = [];
      } else {
        Object.keys(metrics[key as keyof typeof metrics] as any).forEach(subKey => {
          if (typeof (metrics[key as keyof typeof metrics] as any)[subKey] === 'number') {
            (metrics[key as keyof typeof metrics] as any)[subKey] = 0;
          } else if (typeof (metrics[key as keyof typeof metrics] as any)[subKey] === 'object') {
            (metrics[key as keyof typeof metrics] as any)[subKey] = {};
          }
        });
      }
    } else if (typeof metrics[key as keyof typeof metrics] === 'number') {
      (metrics[key as keyof typeof metrics] as any) = 0;
    }
  });
}