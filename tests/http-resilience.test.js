const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { fetchWithPolicy, getCircuitStats, shutdown } = require('../src/lib/http/client');
const { rateLimiter } = require('../src/lib/http/rate-limiter');
const { httpMetrics } = require('../src/lib/http/metrics');
const {
  RateLimitError,
  NetworkError,
  TimeoutError,
  CircuitOpenError,
} = require('../src/lib/http/errors');

describe('HTTP Resilience', () => {
  beforeEach(() => {
    // Clean up any existing nock interceptors
    nock.cleanAll();
    
    // Reset metrics and rate limiters
    rateLimiter.shutdown();
    httpMetrics.metrics = {
      requests: new Map(),
      rateLimits: new Map(),
      retries: new Map(),
      circuitBreaker: new Map(),
      responseTime: new Map(),
      errors: new Map()
    };
  });

  afterEach(() => {
    nock.cleanAll();
    shutdown();
  });

  describe('Rate Limiting', () => {
    it('should respect per-host rate limits', async () => {
      const testHost = 'example.com';
      
      // Mock successful responses
      const scope = nock(`https://${testHost}`)
        .get('/test')
        .times(5)
        .reply(200, 'OK');

      const startTime = Date.now();
      const promises = [];
      
      // Fire 5 requests simultaneously
      for (let i = 0; i < 5; i++) {
        promises.push(fetchWithPolicy(`https://${testHost}/test`));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Should take at least some time due to rate limiting
      // (exact timing depends on configuration)
      assert(duration > 100, 'Rate limiting should introduce delays');
      assert(scope.isDone(), 'All requests should complete');
    });

    it('should handle rate limiter acquisition timeout', async () => {
      const testHost = 'slow.example.com';
      
      // Create a very restrictive rate limiter
      process.env['HOST_LIMIT__slow.example.com__RPS'] = '0.1';
      process.env['HOST_LIMIT__slow.example.com__BURST'] = '1';
      
      try {
        await fetchWithPolicy(`https://${testHost}/test`, { timeout: 100 });
        assert.fail('Should have thrown rate limit timeout error');
      } catch (error) {
        assert(error instanceof RateLimitError);
        assert(error.message.includes('timeout'));
      }
    });
  });

  describe('429 Handling', () => {
    it('should handle 429 with Retry-After header', async () => {
      const testHost = 'ratelimited.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test')
        .reply(429, 'Rate Limited', { 'Retry-After': '1' })
        .get('/test')
        .reply(200, 'Success');

      const startTime = Date.now();
      const response = await fetchWithPolicy(`https://${testHost}/test`);
      const duration = Date.now() - startTime;
      
      assert.strictEqual(response.status, 200);
      assert(duration >= 1000, 'Should wait at least 1 second for Retry-After');
      assert(scope.isDone(), 'Both requests should have been made');
    });

    it('should handle 429 without Retry-After using exponential backoff', async () => {
      const testHost = 'backoff.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test')
        .reply(429, 'Rate Limited')
        .get('/test')
        .reply(200, 'Success');

      const startTime = Date.now();
      const response = await fetchWithPolicy(`https://${testHost}/test`);
      const duration = Date.now() - startTime;
      
      assert.strictEqual(response.status, 200);
      assert(duration >= 500, 'Should use exponential backoff delay');
      assert(scope.isDone(), 'Both requests should have been made');
    });

    it('should not trigger circuit breaker on 429s', async () => {
      const testHost = 'circuit-safe.example.com';
      
      // Multiple 429s followed by success
      const scope = nock(`https://${testHost}`)
        .get('/test').reply(429, 'Rate Limited')
        .get('/test').reply(429, 'Rate Limited')
        .get('/test').reply(429, 'Rate Limited')
        .get('/test').reply(200, 'Success');

      const response = await fetchWithPolicy(`https://${testHost}/test`);
      
      assert.strictEqual(response.status, 200);
      
      // Circuit should still be closed
      const circuitStats = getCircuitStats();
      const hostCircuit = circuitStats[testHost];
      assert.strictEqual(hostCircuit.state, 'closed');
      assert.strictEqual(hostCircuit.failures, 0, '429s should not count as failures');
      
      assert(scope.isDone(), 'All requests should have been made');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit on genuine server errors', async () => {
      const testHost = 'failing.example.com';
      
      // Multiple 500 errors to trigger circuit breaker
      const scope = nock(`https://${testHost}`)
        .get('/test').times(12).reply(500, 'Internal Server Error');

      let circuitOpenError = null;
      
      try {
        await fetchWithPolicy(`https://${testHost}/test`);
      } catch (error) {
        // Should eventually get a circuit open error
        if (error instanceof CircuitOpenError) {
          circuitOpenError = error;
        }
      }
      
      // Circuit should be open
      const circuitStats = getCircuitStats();
      const hostCircuit = circuitStats[testHost];
      assert.strictEqual(hostCircuit.state, 'open');
      assert(hostCircuit.failures >= 10, 'Should have recorded failures');
      
      // Subsequent request should fail immediately with circuit open
      try {
        await fetchWithPolicy(`https://${testHost}/test`);
        assert.fail('Should have thrown CircuitOpenError');
      } catch (error) {
        assert(error instanceof CircuitOpenError);
      }
    });

    it('should transition to half-open and then closed', async () => {
      const testHost = 'recovering.example.com';
      
      // First, trigger circuit open with failures
      let scope = nock(`https://${testHost}`)
        .get('/test').times(15).reply(500, 'Server Error');

      try {
        await fetchWithPolicy(`https://${testHost}/test`);
      } catch (error) {
        // Expected to fail
      }
      
      // Verify circuit is open
      let circuitStats = getCircuitStats();
      assert.strictEqual(circuitStats[testHost].state, 'open');
      
      // Mock time passage for circuit reset (normally 60s)
      const circuit = require('../src/lib/http/client').__circuitForTesting?.(testHost);
      if (circuit) {
        circuit.openedAt = Date.now() - 61000; // 61 seconds ago
      }
      
      // Set up successful responses for recovery
      nock.cleanAll();
      scope = nock(`https://${testHost}`)
        .get('/test').times(5).reply(200, 'Success');

      // Should transition through half-open to closed
      const response = await fetchWithPolicy(`https://${testHost}/test`);
      assert.strictEqual(response.status, 200);
      
      // After successful requests, circuit should be closed
      circuitStats = getCircuitStats();
      assert.strictEqual(circuitStats[testHost].state, 'closed');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      const testHost = 'timeout.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test')
        .delay(2000) // 2 second delay
        .reply(200, 'Too Late');

      try {
        await fetchWithPolicy(`https://${testHost}/test`, { timeout: 500 });
        assert.fail('Should have thrown TimeoutError');
      } catch (error) {
        assert(error instanceof TimeoutError);
        assert(error.message.includes('timed out'));
      }
    });

    it('should not retry client errors (4xx)', async () => {
      const testHost = 'client-error.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test')
        .reply(404, 'Not Found');

      try {
        await fetchWithPolicy(`https://${testHost}/test`);
        assert.fail('Should have thrown NetworkError');
      } catch (error) {
        assert(error instanceof NetworkError);
        assert(error.message.includes('Client error 404'));
      }
      
      // Should only make one request (no retries for 4xx)
      assert(scope.isDone());
    });

    it('should retry server errors (5xx) with backoff', async () => {
      const testHost = 'server-error.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test').reply(500, 'Server Error')
        .get('/test').reply(500, 'Server Error')
        .get('/test').reply(200, 'Success');

      const startTime = Date.now();
      const response = await fetchWithPolicy(`https://${testHost}/test`);
      const duration = Date.now() - startTime;
      
      assert.strictEqual(response.status, 200);
      assert(duration >= 1000, 'Should have backoff delays between retries');
      assert(scope.isDone(), 'Should retry and eventually succeed');
    });
  });

  describe('Integration - PFR Batch Test', () => {
    it('should handle a batch of PFR URLs with mixed 429s and successes', async () => {
      const pfrHost = 'www.pro-football-reference.com';
      const testUrls = [
        `https://${pfrHost}/players/A/AdamDa00.htm`,
        `https://${pfrHost}/players/A/AdamJo21.htm`,
        `https://${pfrHost}/players/A/AdamMa00.htm`,
        `https://${pfrHost}/players/A/AberWa00.htm`,
        `https://${pfrHost}/players/A/AbraAl00.htm`
      ];

      // Set up mixed responses: some 429s, then successes
      const scope = nock(`https://${pfrHost}`)
        // First round: some 429s
        .get('/players/A/AdamDa00.htm').reply(429, 'Rate Limited', { 'Retry-After': '1' })
        .get('/players/A/AdamJo21.htm').reply(200, '<html>Player Data</html>')
        .get('/players/A/AdamMa00.htm').reply(429, 'Rate Limited')
        .get('/players/A/AberWa00.htm').reply(200, '<html>Player Data</html>')
        .get('/players/A/AbraAl00.htm').reply(429, 'Rate Limited')
        
        // Retry attempts for 429s
        .get('/players/A/AdamDa00.htm').reply(200, '<html>Player Data</html>')
        .get('/players/A/AdamMa00.htm').reply(200, '<html>Player Data</html>')
        .get('/players/A/AbraAl00.htm').reply(200, '<html>Player Data</html>');

      // Process batch with concurrency control
      const results = [];
      const errors = [];
      
      for (const url of testUrls) {
        try {
          const response = await fetchWithPolicy(url);
          results.push({
            url,
            status: response.status,
            success: true
          });
        } catch (error) {
          errors.push({
            url,
            error: error.message,
            type: error.constructor.name
          });
        }
      }

      // Verify results
      assert.strictEqual(results.length, 5, 'All URLs should eventually succeed');
      assert.strictEqual(errors.length, 0, 'No fatal errors should occur');
      
      // Verify no 500s from 429s
      for (const result of results) {
        assert.strictEqual(result.status, 200);
      }
      
      // Circuit breaker should remain closed
      const circuitStats = getCircuitStats();
      const pfrCircuit = circuitStats[pfrHost];
      assert.strictEqual(pfrCircuit.state, 'closed', 'Circuit should remain closed');
      assert.strictEqual(pfrCircuit.failures, 0, 'No failures should be recorded for 429s');
      
      // Verify metrics were recorded
      const metrics = httpMetrics.getHostMetrics(pfrHost);
      assert(metrics.rateLimits['429_deferred'] > 0, 'Should have recorded 429 deferrals');
      assert(metrics.retries['429_retry_after'] >= 0, 'Should have recorded retry-after retries');
      
      assert(scope.isDone(), 'All expected requests should have been made');
    });
  });

  describe('Observability', () => {
    it('should record comprehensive metrics', async () => {
      const testHost = 'metrics.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test').reply(429, 'Rate Limited', { 'Retry-After': '0.1' })
        .get('/test').reply(200, 'Success');

      await fetchWithPolicy(`https://${testHost}/test`);
      
      const metrics = httpMetrics.getHostMetrics(testHost);
      
      // Should have recorded various metrics
      assert(metrics.requests['2xx'], 'Should record successful requests');
      assert(metrics.rateLimits['429_deferred'], 'Should record 429 deferrals');
      assert(metrics.retries['429_retry_after'], 'Should record retries');
      assert(metrics.responseTime.count > 0, 'Should record response times');
      
      assert(scope.isDone());
    });

    it('should provide rate limit dashboard data', async () => {
      const testHost = 'dashboard.example.com';
      
      const scope = nock(`https://${testHost}`)
        .get('/test').reply(429, 'Rate Limited')
        .get('/test').reply(200, 'Success');

      await fetchWithPolicy(`https://${testHost}/test`);
      
      const dashboard = httpMetrics.getRateLimitDashboard();
      
      assert(dashboard.hosts[testHost], 'Should have host data');
      assert(dashboard.hosts[testHost]['429_deferred'] > 0, 'Should show deferred count');
      
      assert(scope.isDone());
    });
  });
});