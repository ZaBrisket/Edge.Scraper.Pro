const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { fetchWithPolicy, getCircuitStats, shutdown } = require('../src/lib/http/client');
const { rateLimiter } = require('../src/lib/http/rate-limiter');
const { httpMetrics } = require('../src/lib/http/metrics');
const {
  RateLimitError,
  NetworkError,
  TimeoutError,
  CircuitOpenError,
} = require('../src/lib/http/errors');

describe('HTTP Basic Functionality', () => {
  afterEach(() => {
    shutdown();
  });

  describe('Configuration', () => {
    it('should load config with proper defaults', () => {
      const config = require('../src/lib/config');
      
      assert(config.DEFAULT_TIMEOUT_MS > 0, 'Should have positive timeout');
      assert(config.MAX_RETRIES >= 0, 'Should have non-negative retries');
      assert(config.CIRCUIT_BREAKER_THRESHOLD > 0, 'Should have positive circuit threshold');
      assert(config.HOST_LIMITS, 'Should have host limits configuration');
    });
  });

  describe('Rate Limiter', () => {
    it('should create rate limiter with proper settings', () => {
      const stats = rateLimiter.getStats('test.example.com');
      
      // Initially no stats since no limiter created yet
      assert.strictEqual(stats, null);
      
      // After acquiring, should have stats
      rateLimiter.getLimiter('test.example.com');
      const statsAfter = rateLimiter.getStats('test.example.com');
      
      assert(statsAfter !== null, 'Should have limiter stats');
      assert(statsAfter.limiter.rps > 0, 'Should have positive RPS');
      assert(statsAfter.limiter.burst > 0, 'Should have positive burst');
    });

    it('should track metrics correctly', async () => {
      const host = 'metrics-test.example.com';
      
      // First create a limiter for the host
      rateLimiter.getLimiter(host);
      
      // Record some metrics
      rateLimiter.recordMetric('hits', host);
      rateLimiter.recordMetric('waits', host, 500);
      
      const stats = rateLimiter.getStats(host);
      assert(stats !== null, 'Should have stats after creating limiter');
      assert(stats.metrics.hits > 0, 'Should record hit metrics');
      assert(stats.metrics.averageWait > 0, 'Should record wait metrics');
    });
  });

  describe('HTTP Metrics', () => {
    it('should record request metrics', () => {
      const host = 'request-test.example.com';
      const correlationId = 'test-123';
      
      httpMetrics.recordRequest(host, 200, 150, correlationId);
      
      const metrics = httpMetrics.getHostMetrics(host);
      assert(metrics.requests['2xx'], 'Should record 2xx requests');
      assert(metrics.responseTime.count > 0, 'Should record response times');
    });

    it('should record 429 deferrals', () => {
      const host = '429-test.example.com';
      const correlationId = 'test-429';
      
      httpMetrics.record429Deferred(host, 1000, correlationId);
      
      const metrics = httpMetrics.getHostMetrics(host);
      assert(metrics.rateLimits['429_deferred'] > 0, 'Should record 429 deferrals');
    });

    it('should record retry events', () => {
      const host = 'retry-test.example.com';
      const correlationId = 'test-retry';
      
      httpMetrics.recordRetryScheduled(host, '429_backoff', 2000, 2, correlationId);
      
      const metrics = httpMetrics.getHostMetrics(host);
      assert(metrics.retries['429_backoff'] > 0, 'Should record retry events');
    });
  });

  describe('Circuit Breaker', () => {
    it('should initialize circuit stats', () => {
      const stats = getCircuitStats();
      
      // Initially empty
      assert.strictEqual(Object.keys(stats).length, 0, 'Should start with no circuits');
    });
  });

  describe('Error Types', () => {
    it('should create proper error types', () => {
      const rateLimitError = new RateLimitError('Test rate limit', { status: 429 });
      assert(rateLimitError instanceof RateLimitError);
      assert.strictEqual(rateLimitError.code, 'RATE_LIMIT');
      assert.strictEqual(rateLimitError.meta.status, 429);

      const networkError = new NetworkError('Test network error', { status: 500 });
      assert(networkError instanceof NetworkError);
      assert.strictEqual(networkError.code, 'NETWORK_ERROR');

      const timeoutError = new TimeoutError('Test timeout', { timeout: 5000 });
      assert(timeoutError instanceof TimeoutError);
      assert.strictEqual(timeoutError.code, 'TIMEOUT');

      const circuitError = new CircuitOpenError('Circuit open', { host: 'test.com' });
      assert(circuitError instanceof CircuitOpenError);
      assert.strictEqual(circuitError.code, 'CIRCUIT_OPEN');
    });
  });

  describe('URL Parsing', () => {
    it('should handle various URL formats', async () => {
      // Test that URL parsing works without making actual requests
      const testUrls = [
        'https://www.example.com/test',
        'http://subdomain.example.com/path?query=1',
        new URL('https://www.test.com/page')
      ];

      for (const url of testUrls) {
        try {
          // This will fail due to network, but should parse URL correctly
          await fetchWithPolicy(url, { timeout: 1 });
        } catch (error) {
          // Expected to fail - we're just testing URL parsing doesn't throw
          assert(error instanceof NetworkError || error instanceof TimeoutError);
        }
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should use PFR-specific rate limits', () => {
      const pfrHost = 'www.pro-football-reference.com';
      const limiter = rateLimiter.getLimiter(pfrHost);
      const stats = rateLimiter.getStats(pfrHost);
      
      // Should use the conservative PFR settings
      assert(stats.limiter.rps <= 1.0, 'PFR should have low RPS limit');
      assert(stats.limiter.burst <= 3, 'PFR should have low burst limit');
    });

    it('should use default limits for unknown hosts', () => {
      const unknownHost = 'unknown.example.com';
      const limiter = rateLimiter.getLimiter(unknownHost);
      const stats = rateLimiter.getStats(unknownHost);
      
      // Should use default settings
      assert(stats.limiter.rps >= 2.0, 'Unknown hosts should use default RPS');
      assert(stats.limiter.burst >= 5, 'Unknown hosts should use default burst');
    });
  });
});