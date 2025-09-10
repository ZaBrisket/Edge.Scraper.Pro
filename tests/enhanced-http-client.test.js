const test = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const http = require('node:http');

// Set test environment variables
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

const { fetchWithPolicy, getMetrics, resetMetrics } = require('../src/lib/http/enhanced-client');
const { TimeoutError, CircuitOpenError, NetworkError, RateLimitError } = require('../src/lib/http/errors');

test.beforeEach(() => {
  resetMetrics();
  nock.cleanAll();
});

test('handles 429 responses with retry-after header', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/A/AllenJo00.htm')
    .reply(429, 'Rate limited', { 'Retry-After': '2' })
    .get('/players/A/AllenJo00.htm')
    .reply(200, 'Success');

  const start = Date.now();
  const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm');
  const duration = Date.now() - start;

  assert.strictEqual(response.status, 200);
  assert.ok(duration >= 2000, 'Should respect Retry-After header');
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
  // Circuit should not be open despite multiple 429s
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, 'closed');
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
  assert.strictEqual(circuit.state, 'open');
  assert.strictEqual(circuit.failures, 3);
});

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
  await new Promise(resolve => setTimeout(resolve, 2100));

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
  assert.strictEqual(circuit.state, 'closed');
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

test('provides detailed metrics', async (t) => {
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
});

test('handles timeout errors', async (t) => {
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
});

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