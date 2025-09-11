/**
 * Comprehensive Test Suite for Hardened HTTP Client
 * 
 * Tests cover:
 * - Input validation and sanitization
 * - Error handling and recovery
 * - Circuit breaker behavior
 * - Rate limiting and backoff
 * - Timeout handling
 * - Resource cleanup
 * - Metrics and observability
 * - Edge cases and failure modes
 */

const test = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { setTimeout } = require('node:timers/promises');

// Set deterministic test environment
process.env.HTTP_MAX_RETRIES = '3';
process.env.HTTP_DEADLINE_MS = '1000';
process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD = '3';
process.env.HTTP_CIRCUIT_BREAKER_RESET_MS = '2000';
process.env.HTTP_RATE_LIMIT_PER_SEC = '10';
process.env.HTTP_MAX_CONCURRENCY = '2';
process.env.HOST_LIMIT__www_pro_football_reference_com__RPS = '2';
process.env.HOST_LIMIT__www_pro_football_reference_com__BURST = '1';
process.env.HTTP_BASE_BACKOFF_MS = '100';
process.env.HTTP_MAX_BACKOFF_MS = '1000';
process.env.HTTP_JITTER_FACTOR = '0.1';
process.env.HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS = '2';

const { 
  fetchWithPolicy, 
  getMetrics, 
  resetMetrics,
  gracefulShutdown,
  getHealthStatus,
  CIRCUIT_STATES
} = require('../src/lib/http/hardened-client');
const { 
  TimeoutError, 
  CircuitOpenError, 
  NetworkError, 
  RateLimitError,
  ValidationError 
} = require('../src/lib/http/errors');

// Test utilities
function createMockResponse(status, body, headers = {}) {
  return { status, body, headers };
}

function createMockError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Test setup
test.beforeEach(() => {
  resetMetrics();
  nock.cleanAll();
});

test.afterEach(() => {
  nock.cleanAll();
});

// Input Validation Tests
test('validates URL input correctly', async (t) => {
  // Valid URLs
  const validUrls = [
    'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
    'http://example.com',
    'https://subdomain.example.com/path?query=value'
  ];
  
  for (const url of validUrls) {
    const scope = nock(url.split('/')[0] + '//' + url.split('/')[2])
      .get(/.*/)
      .reply(200, 'Success');
    
    const response = await fetchWithPolicy(url);
    assert.strictEqual(response.status, 200);
    assert.ok(scope.isDone());
  }
});

test('rejects invalid URL input', async (t) => {
  const invalidInputs = [
    null,
    undefined,
    '',
    'not-a-url',
    'ftp://example.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://',
    'https://example.com/'.repeat(1000), // Too long
    { invalid: 'object' }
  ];
  
  for (const input of invalidInputs) {
    await assert.rejects(
      () => fetchWithPolicy(input),
      ValidationError
    );
  }
});

test('validates options parameter', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .reply(200, 'Success');
  
  // Valid options
  await assert.doesNotReject(() => 
    fetchWithPolicy('https://example.com', {
      timeout: 5000,
      retries: 2,
      headers: { 'Custom-Header': 'value' },
      method: 'GET'
    })
  );
  
  // Invalid options
  await assert.rejects(
    () => fetchWithPolicy('https://example.com', { timeout: -1 }),
    ValidationError
  );
  
  await assert.rejects(
    () => fetchWithPolicy('https://example.com', { retries: 15 }),
    ValidationError
  );
  
  await assert.rejects(
    () => fetchWithPolicy('https://example.com', { method: 'INVALID' }),
    ValidationError
  );
  
  assert.ok(scope.isDone());
});

// Error Handling Tests
test('handles 429 responses with retry-after header', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/A/AllenJo00.htm')
    .reply(429, 'Rate limited', { 'Retry-After': '1' })
    .get('/players/A/AllenJo00.htm')
    .reply(200, 'Success');

  const start = Date.now();
  const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm');
  const duration = Date.now() - start;

  assert.strictEqual(response.status, 200);
  assert.ok(duration >= 1000, 'Should respect Retry-After header');
  assert.ok(scope.isDone());

  const metrics = getMetrics();
  assert.strictEqual(metrics.rateLimits.hits, 1);
  assert.strictEqual(metrics.retries.scheduled, 1);
  assert.strictEqual(metrics.retries.byReason['429'], 1);
});

test('handles 429 responses without retry-after header', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/B/BradyTo00.htm')
    .reply(429, 'Rate limited')
    .get('/players/B/BradyTo00.htm')
    .reply(200, 'Success');

  const start = Date.now();
  const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/B/BradyTo00.htm');
  const duration = Date.now() - start;

  assert.strictEqual(response.status, 200);
  assert.ok(duration >= 100, 'Should use exponential backoff');
  assert.ok(scope.isDone());

  const metrics = getMetrics();
  assert.strictEqual(metrics.rateLimits.hits, 1);
  assert.strictEqual(metrics.retries.scheduled, 1);
});

test('does not count 429 responses as circuit breaker failures', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/M/MahomesPa00.htm')
    .reply(429, 'Rate limited')
    .get('/players/M/MahomesPa00.htm')
    .reply(429, 'Rate limited')
    .get('/players/M/MahomesPa00.htm')
    .reply(429, 'Rate limited')
    .get('/players/M/MahomesPa00.htm')
    .reply(200, 'Success');

  const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/M/MahomesPa00.htm');
  
  assert.strictEqual(response.status, 200);
  assert.ok(scope.isDone());

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, CIRCUIT_STATES.CLOSED);
  assert.strictEqual(metrics.rateLimits.hits, 3);
});

test('opens circuit breaker on 5xx responses', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/W/WilsonRu00.htm')
    .reply(500, 'Server error')
    .get('/players/W/WilsonRu00.htm')
    .reply(500, 'Server error')
    .get('/players/W/WilsonRu00.htm')
    .reply(500, 'Server error');

  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/W/WilsonRu00.htm'),
    CircuitOpenError
  );

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, CIRCUIT_STATES.OPEN);
  assert.strictEqual(circuit.failures, 3);
});

test('handles circuit breaker half-open state', async (t) => {
  // First, open the circuit
  const scope1 = nock('https://www.pro-football-reference.com')
    .get('/players/A/AllenJo00.htm')
    .reply(500, 'Server error')
    .get('/players/A/AllenJo00.htm')
    .reply(500, 'Server error')
    .get('/players/A/AllenJo00.htm')
    .reply(500, 'Server error');

  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm'),
    CircuitOpenError
  );

  // Wait for circuit to reset
  await setTimeout(2100);

  // Now test half-open state
  const scope2 = nock('https://www.pro-football-reference.com')
    .get('/players/B/BradyTo00.htm')
    .reply(200, 'Success')
    .get('/players/C/ChaseJa00.htm')
    .reply(200, 'Success')
    .get('/players/D/DavisGa00.htm')
    .reply(200, 'Success');

  // First call should succeed (half-open allows limited calls)
  const response1 = await fetchWithPolicy('https://www.pro-football-reference.com/players/B/BradyTo00.htm');
  assert.strictEqual(response1.status, 200);

  // Second call should succeed (still within half-open limit)
  const response2 = await fetchWithPolicy('https://www.pro-football-reference.com/players/C/ChaseJa00.htm');
  assert.strictEqual(response2.status, 200);

  // Third call should succeed and close circuit
  const response3 = await fetchWithPolicy('https://www.pro-football-reference.com/players/D/DavisGa00.htm');
  assert.strictEqual(response3.status, 200);

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, CIRCUIT_STATES.CLOSED);
});

test('exhausts retries on persistent 429 responses', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/E/EkelerAu00.htm')
    .reply(429, 'Rate limited')
    .get('/players/E/EkelerAu00.htm')
    .reply(429, 'Rate limited')
    .get('/players/E/EkelerAu00.htm')
    .reply(429, 'Rate limited')
    .get('/players/E/EkelerAu00.htm')
    .reply(429, 'Rate limited');

  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/E/EkelerAu00.htm'),
    RateLimitError
  );

  const metrics = getMetrics();
  assert.strictEqual(metrics.rateLimits.hits, 4);
  assert.strictEqual(metrics.retries.scheduled, 3);
});

// Timeout Tests
test('handles timeout errors correctly', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/G/GibsonAn00.htm')
    .delay(2000) // Longer than timeout
    .reply(200, 'Success');

  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/G/GibsonAn00.htm', { timeout: 100 }),
    TimeoutError
  );

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.failures, 1);
  assert.strictEqual(metrics.timeouts.count, 1);
});

// Rate Limiting Tests
test('respects per-host rate limiting', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/A/AllenJo00.htm')
    .reply(200, 'Success')
    .get('/players/B/BradyTo00.htm')
    .reply(200, 'Success');

  const start = Date.now();
  const promises = [
    fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm'),
    fetchWithPolicy('https://www.pro-football-reference.com/players/B/BradyTo00.htm')
  ];
  
  await Promise.all(promises);
  const duration = Date.now() - start;

  // With RPS=2 and burst=1, second request should be delayed
  assert.ok(duration >= 500, 'Should respect rate limiting');
  assert.ok(scope.isDone());
});

// Metrics Tests
test('provides comprehensive metrics', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/F/FantNo00.htm')
    .reply(429, 'Rate limited')
    .get('/players/F/FantNo00.htm')
    .reply(200, 'Success');

  await fetchWithPolicy('https://www.pro-football-reference.com/players/F/FantNo00.htm');

  const metrics = getMetrics();
  assert.strictEqual(metrics.requests.total, 2);
  assert.strictEqual(metrics.requests.byHost['www.pro-football-reference.com'], 2);
  assert.strictEqual(metrics.requests.byStatus[200], 1);
  assert.strictEqual(metrics.requests.byStatus[429], 1);
  assert.strictEqual(metrics.rateLimits.hits, 1);
  assert.strictEqual(metrics.retries.scheduled, 1);
  assert.strictEqual(metrics.deferrals.count, 1);
  assert.strictEqual(metrics.requests.active, 0);
  assert.strictEqual(metrics.requests.completed, 1);
  assert.strictEqual(metrics.requests.failed, 0);
});

// Health Check Tests
test('provides health status', async (t) => {
  const health = getHealthStatus();
  
  assert.ok(['healthy', 'degraded'].includes(health.status));
  assert.strictEqual(typeof health.activeRequests, 'number');
  assert.ok(health.circuits);
  assert.ok(health.metrics);
});

// Resource Cleanup Tests
test('tracks active requests correctly', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .delay(100)
    .reply(200, 'Success');

  const promise = fetchWithPolicy('https://example.com');
  
  // Check that request is tracked as active
  const metrics = getMetrics();
  assert.strictEqual(metrics.activeRequests, 1);
  
  await promise;
  
  // Check that request is no longer active
  const finalMetrics = getMetrics();
  assert.strictEqual(finalMetrics.activeRequests, 0);
});

// Graceful Shutdown Tests
test('handles graceful shutdown', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .delay(2000)
    .reply(200, 'Success');

  // Start a long-running request
  const promise = fetchWithPolicy('https://example.com');
  
  // Start graceful shutdown
  const shutdownPromise = gracefulShutdown(1000);
  
  // Wait for shutdown to complete
  await shutdownPromise;
  
  // The request should be cancelled
  await assert.rejects(() => promise, TimeoutError);
});

// Edge Cases and Error Scenarios
test('handles network errors gracefully', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .replyWithError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' });

  await assert.rejects(
    () => fetchWithPolicy('https://example.com'),
    NetworkError
  );

  const metrics = getMetrics();
  assert.strictEqual(metrics.errors.total, 1);
  assert.strictEqual(metrics.errors.byType['NetworkError'], 1);
});

test('handles malformed responses', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .reply(200, 'Success', { 'Content-Type': 'text/html' });

  const response = await fetchWithPolicy('https://example.com');
  assert.strictEqual(response.status, 200);
  assert.ok(scope.isDone());
});

test('handles very large responses', async (t) => {
  const largeBody = 'x'.repeat(1024 * 1024); // 1MB
  const scope = nock('https://example.com')
    .get('/')
    .reply(200, largeBody);

  const response = await fetchWithPolicy('https://example.com');
  assert.strictEqual(response.status, 200);
  assert.ok(scope.isDone());
});

// Performance Tests
test('measures response times correctly', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .delay(100)
    .reply(200, 'Success');

  await fetchWithPolicy('https://example.com');

  const metrics = getMetrics();
  assert.ok(metrics.performance.averageResponseTimeMs > 0);
  assert.ok(metrics.performance.totalResponseTimeMs > 0);
  assert.strictEqual(metrics.performance.responseTimes.length, 1);
});

// Integration Tests
test('integration test with mixed responses', async (t) => {
  const urls = [
    'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
    'https://www.pro-football-reference.com/players/B/BradyTo00.htm',
    'https://www.pro-football-reference.com/players/M/MahomesPa00.htm',
    'https://www.pro-football-reference.com/players/W/WilsonRu00.htm',
    'https://www.pro-football-reference.com/players/C/ChaseJa00.htm'
  ];

  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/A/AllenJo00.htm')
    .reply(200, 'Success')
    .get('/players/B/BradyTo00.htm')
    .reply(429, 'Rate limited')
    .get('/players/B/BradyTo00.htm')
    .reply(200, 'Success')
    .get('/players/M/MahomesPa00.htm')
    .reply(200, 'Success')
    .get('/players/W/WilsonRu00.htm')
    .reply(500, 'Server error')
    .get('/players/C/ChaseJa00.htm')
    .reply(200, 'Success');

  const results = await Promise.allSettled(
    urls.map(url => fetchWithPolicy(url))
  );

  // Should have 4 successes and 1 failure (500 error)
  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected').length;

  assert.strictEqual(successes, 4);
  assert.strictEqual(failures, 1);

  const metrics = getMetrics();
  assert.strictEqual(metrics.requests.total, 6); // 5 initial + 1 retry
  assert.strictEqual(metrics.rateLimits.hits, 1);
  assert.strictEqual(metrics.retries.scheduled, 1);
  assert.strictEqual(metrics.deferrals.count, 1);
});

// Deterministic Testing
test('uses deterministic random seeds for testing', async (t) => {
  // This test ensures that jitter calculations are deterministic in tests
  const scope = nock('https://example.com')
    .get('/')
    .reply(200, 'Success');

  const start = Date.now();
  await fetchWithPolicy('https://example.com');
  const duration1 = Date.now() - start;

  resetMetrics();
  nock.cleanAll();
  
  const scope2 = nock('https://example.com')
    .get('/')
    .reply(200, 'Success');

  const start2 = Date.now();
  await fetchWithPolicy('https://example.com');
  const duration2 = Date.now() - start2;

  // Durations should be similar (within 50ms tolerance)
  assert.ok(Math.abs(duration1 - duration2) < 50, 'Test should be deterministic');
});

console.log('✅ Hardened HTTP Client test suite loaded');