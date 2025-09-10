const test = require('node:test');
const assert = require('node:assert');
const nock = require('nock');

// Set test environment variables for PFR scenario
process.env.HTTP_MAX_RETRIES = '3';
process.env.HTTP_DEADLINE_MS = '5000';
process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD = '5';
process.env.HTTP_CIRCUIT_BREAKER_RESET_MS = '10000';
process.env.HOST_LIMIT__www_pro_football_reference_com__RPS = '0.5';
process.env.HOST_LIMIT__www_pro_football_reference_com__BURST = '1';
process.env.HTTP_BASE_BACKOFF_MS = '1000';
process.env.HTTP_MAX_BACKOFF_MS = '5000';
process.env.HTTP_JITTER_FACTOR = '0.1';
process.env.HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS = '3';

const { fetchWithPolicy, getMetrics, resetMetrics } = require('../src/lib/http/enhanced-client');
const { RateLimitError, CircuitOpenError } = require('../src/lib/http/errors');

test.beforeEach(() => {
  resetMetrics();
  nock.cleanAll();
});

test('PFR batch processing with 429 handling - no fatal 500s', async (t) => {
  // Simulate a batch of 20 PFR player URLs
  const pfrUrls = Array.from({ length: 20 }, (_, i) => 
    `https://www.pro-football-reference.com/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`
  );

  // Mock responses: mix of 200s, 429s, and some 500s
  const scope = nock('https://www.pro-football-reference.com');
  
  // First 5 requests succeed immediately
  for (let i = 0; i < 5; i++) {
    scope.get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(200, `Player ${i} data`);
  }
  
  // Next 10 requests get 429, then succeed on retry
  for (let i = 5; i < 15; i++) {
    scope.get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(429, 'Rate limited', { 'Retry-After': '1' })
      .get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(200, `Player ${i} data`);
  }
  
  // Next 3 requests get 429, then 429 again, then succeed
  for (let i = 15; i < 18; i++) {
    scope.get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(429, 'Rate limited', { 'Retry-After': '1' })
      .get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(429, 'Rate limited', { 'Retry-After': '1' })
      .get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(200, `Player ${i} data`);
  }
  
  // Last 2 requests succeed immediately
  for (let i = 18; i < 20; i++) {
    scope.get(`/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`)
      .reply(200, `Player ${i} data`);
  }

  const start = Date.now();
  const results = await Promise.allSettled(
    pfrUrls.map(url => fetchWithPolicy(url))
  );
  const duration = Date.now() - start;

  // Analyze results
  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected').length;
  const rateLimitFailures = results.filter(r => 
    r.status === 'rejected' && r.reason instanceof RateLimitError
  ).length;
  const circuitFailures = results.filter(r => 
    r.status === 'rejected' && r.reason instanceof CircuitOpenError
  ).length;

  // Assertions
  assert.strictEqual(successes, 20, 'All requests should eventually succeed');
  assert.strictEqual(failures, 0, 'No requests should fail');
  assert.strictEqual(rateLimitFailures, 0, 'No rate limit failures should be fatal');
  assert.strictEqual(circuitFailures, 0, 'Circuit breaker should not open');

  // Check metrics
  const metrics = getMetrics();
  assert.strictEqual(metrics.requests.total, 33, 'Should have made 20 + 13 retry requests');
  assert.strictEqual(metrics.rateLimits.hits, 13, 'Should have hit rate limits 13 times');
  assert.strictEqual(metrics.retries.scheduled, 13, 'Should have scheduled 13 retries');
  assert.strictEqual(metrics.deferrals.count, 13, 'Should have deferred 13 requests');

  // Circuit should remain closed
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, 'closed');
  assert.strictEqual(circuit.failures, 0, 'No circuit breaker failures');

  // Should respect rate limiting (0.5 RPS = 2 seconds per request)
  assert.ok(duration >= 20000, 'Should respect rate limiting timing');

  console.log(`✅ PFR batch completed successfully in ${duration}ms`);
  console.log(`   - ${successes} successes, ${failures} failures`);
  console.log(`   - ${metrics.rateLimits.hits} rate limit hits`);
  console.log(`   - ${metrics.retries.scheduled} retries scheduled`);
  console.log(`   - Circuit state: ${circuit.state}`);
});

test('PFR batch with some 5xx errors - circuit breaker behavior', async (t) => {
  const pfrUrls = [
    'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
    'https://www.pro-football-reference.com/players/B/BradyTo00.htm',
    'https://www.pro-football-reference.com/players/M/MahomesPa00.htm',
    'https://www.pro-football-reference.com/players/W/WilsonRu00.htm',
    'https://www.pro-football-reference.com/players/C/ChaseJa00.htm',
    'https://www.pro-football-reference.com/players/D/DavisGa00.htm',
    'https://www.pro-football-reference.com/players/E/EkelerAu00.htm'
  ];

  const scope = nock('https://www.pro-football-reference.com');
  
  // First 2 succeed
  scope.get('/players/A/AllenJo00.htm')
    .reply(200, 'Allen data');
  scope.get('/players/B/BradyTo00.htm')
    .reply(200, 'Brady data');
  
  // Next 3 get 500 errors (should trigger circuit breaker)
  scope.get('/players/M/MahomesPa00.htm')
    .reply(500, 'Server error');
  scope.get('/players/W/WilsonRu00.htm')
    .reply(500, 'Server error');
  scope.get('/players/C/ChaseJa00.htm')
    .reply(500, 'Server error');
  
  // These should be blocked by circuit breaker
  scope.get('/players/D/DavisGa00.htm')
    .reply(500, 'Server error');
  scope.get('/players/E/EkelerAu00.htm')
    .reply(500, 'Server error');

  const results = await Promise.allSettled(
    pfrUrls.map(url => fetchWithPolicy(url))
  );

  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected').length;
  const circuitFailures = results.filter(r => 
    r.status === 'rejected' && r.reason instanceof CircuitOpenError
  ).length;

  // Should have 2 successes, 5 failures (3 from 500s, 2 from circuit breaker)
  assert.strictEqual(successes, 2);
  assert.strictEqual(failures, 5);
  assert.strictEqual(circuitFailures, 2, 'Last 2 should be blocked by circuit breaker');

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, 'open');
  assert.strictEqual(circuit.failures, 3);

  console.log(`✅ PFR batch with 5xx errors completed`);
  console.log(`   - ${successes} successes, ${failures} failures`);
  console.log(`   - ${circuitFailures} circuit breaker blocks`);
  console.log(`   - Circuit state: ${circuit.state}`);
});

test('PFR batch with mixed 429 and 5xx - proper error handling', async (t) => {
  const pfrUrls = [
    'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
    'https://www.pro-football-reference.com/players/B/BradyTo00.htm',
    'https://www.pro-football-reference.com/players/M/MahomesPa00.htm',
    'https://www.pro-football-reference.com/players/W/WilsonRu00.htm',
    'https://www.pro-football-reference.com/players/C/ChaseJa00.htm'
  ];

  const scope = nock('https://www.pro-football-reference.com');
  
  // Mix of responses
  scope.get('/players/A/AllenJo00.htm')
    .reply(200, 'Allen data');
  scope.get('/players/B/BradyTo00.htm')
    .reply(429, 'Rate limited', { 'Retry-After': '1' })
    .get('/players/B/BradyTo00.htm')
    .reply(200, 'Brady data');
  scope.get('/players/M/MahomesPa00.htm')
    .reply(500, 'Server error');
  scope.get('/players/W/WilsonRu00.htm')
    .reply(429, 'Rate limited', { 'Retry-After': '1' })
    .get('/players/W/WilsonRu00.htm')
    .reply(200, 'Wilson data');
  scope.get('/players/C/ChaseJa00.htm')
    .reply(200, 'Chase data');

  const results = await Promise.allSettled(
    pfrUrls.map(url => fetchWithPolicy(url))
  );

  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results.filter(r => r.status === 'rejected').length;
  const rateLimitFailures = results.filter(r => 
    r.status === 'rejected' && r.reason instanceof RateLimitError
  ).length;

  // Should have 4 successes, 1 failure (500 error)
  assert.strictEqual(successes, 4);
  assert.strictEqual(failures, 1);
  assert.strictEqual(rateLimitFailures, 0, '429s should be handled, not fail');

  const metrics = getMetrics();
  assert.strictEqual(metrics.rateLimits.hits, 2, 'Should have hit rate limits 2 times');
  assert.strictEqual(metrics.retries.scheduled, 2, 'Should have scheduled 2 retries');
  assert.strictEqual(metrics.deferrals.count, 2, 'Should have deferred 2 requests');

  // Circuit should remain closed (only 1 500 error)
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, 'closed');
  assert.strictEqual(circuit.failures, 1);

  console.log(`✅ PFR batch with mixed responses completed`);
  console.log(`   - ${successes} successes, ${failures} failures`);
  console.log(`   - ${metrics.rateLimits.hits} rate limit hits`);
  console.log(`   - Circuit state: ${circuit.state}`);
});