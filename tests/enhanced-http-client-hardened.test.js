const test = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { randomUUID } = require('crypto');
const timers = require('node:timers/promises');

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
process.env.HTTP_INTER_REQUEST_DELAY_MS = '50';

const { fetchWithPolicy, getMetrics, resetMetrics, cleanup } = require('../src/lib/http/enhanced-client-hardened');
const { TimeoutError, CircuitOpenError, NetworkError, RateLimitError, ValidationError } = require('../src/lib/http/errors');

test.beforeEach(() => {
  resetMetrics();
  nock.cleanAll();
});

test.afterEach(() => {
  cleanup(); // Clean up any lingering state
});

// Input validation tests
test('validates URL input', async (t) => {
  await t.test('rejects invalid URLs', async () => {
    await assert.rejects(
      () => fetchWithPolicy('not-a-url'),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy('ftp://example.com'),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy(''),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy(null),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy({}),
      ValidationError
    );
  });
  
  await t.test('accepts valid URLs', async () => {
    const scope = nock('https://example.com')
      .get('/')
      .reply(200, 'OK');
    
    const response = await fetchWithPolicy('https://example.com/');
    assert.strictEqual(response.status, 200);
    assert.ok(scope.isDone());
  });
});

test('validates options', async (t) => {
  await t.test('rejects invalid options', async () => {
    await assert.rejects(
      () => fetchWithPolicy('https://example.com', { retries: -1 }),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy('https://example.com', { retries: 11 }),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy('https://example.com', { timeout: 50 }),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy('https://example.com', { correlationId: 'not-a-uuid' }),
      ValidationError
    );
    
    await assert.rejects(
      () => fetchWithPolicy('https://example.com', { unknownOption: true }),
      ValidationError
    );
  });
  
  await t.test('accepts valid options', async () => {
    const scope = nock('https://example.com')
      .get('/')
      .reply(200, 'OK');
    
    const response = await fetchWithPolicy('https://example.com/', {
      retries: 2,
      timeout: 5000,
      correlationId: randomUUID(),
      headers: { 'X-Custom': 'value' }
    });
    
    assert.strictEqual(response.status, 200);
    assert.ok(scope.isDone());
  });
});

// Edge case: malformed headers
test('handles malformed headers gracefully', async (t) => {
  const scope = nock('https://example.com')
    .get('/')
    .reply(200, 'OK', {
      'Content-Type': 'text/plain',
      'X-Invalid': '\x00\x01\x02', // Invalid characters
      'Retry-After': 'invalid-value'
    });
  
  const response = await fetchWithPolicy('https://example.com/');
  assert.strictEqual(response.status, 200);
  assert.ok(scope.isDone());
});

// 429 rate limiting tests
test('handles 429 responses with retry-after header', async (t) => {
  await t.test('respects numeric Retry-After', async () => {
    const scope = nock('https://www.pro-football-reference.com')
      .get('/players/A/AllenJo00.htm')
      .reply(429, 'Rate limited', { 'Retry-After': '1' })
      .get('/players/A/AllenJo00.htm')
      .reply(200, 'Success');

    const start = Date.now();
    const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm');
    const duration = Date.now() - start;

    assert.strictEqual(response.status, 200);
    assert.ok(duration >= 1000, `Expected delay >= 1000ms, got ${duration}ms`);
    assert.ok(scope.isDone());

    const metrics = getMetrics();
    assert.strictEqual(metrics.rateLimits.hits, 1);
    assert.strictEqual(metrics.retries.scheduled, 1);
    assert.strictEqual(metrics.retries.byReason['429'], 1);
  });
  
  await t.test('respects HTTP date Retry-After', async () => {
    const futureDate = new Date(Date.now() + 2000).toUTCString();
    const scope = nock('https://www.pro-football-reference.com')
      .get('/players/B/BradyTo00.htm')
      .reply(429, 'Rate limited', { 'Retry-After': futureDate })
      .get('/players/B/BradyTo00.htm')
      .reply(200, 'Success');

    const start = Date.now();
    const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/B/BradyTo00.htm');
    const duration = Date.now() - start;

    assert.strictEqual(response.status, 200);
    assert.ok(duration >= 1900, `Expected delay >= 1900ms, got ${duration}ms`);
    assert.ok(scope.isDone());
  });
  
  await t.test('handles invalid Retry-After gracefully', async () => {
    const scope = nock('https://www.pro-football-reference.com')
      .get('/players/C/CarrDe00.htm')
      .reply(429, 'Rate limited', { 'Retry-After': 'invalid' })
      .get('/players/C/CarrDe00.htm')
      .reply(200, 'Success');

    const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/C/CarrDe00.htm');
    assert.strictEqual(response.status, 200);
    assert.ok(scope.isDone());
  });
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

// Circuit breaker tests
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
  assert.ok(circuit.openedAt);
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
  await timers.setTimeout(2100);

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

  // Third call should fail (exceeds half-open limit)
  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/D/DavisGa00.htm'),
    CircuitOpenError
  );

  const metrics = getMetrics();
  const circuit = metrics.circuits.find(c => c.host === 'www.pro-football-reference.com');
  assert.strictEqual(circuit.state, 'half-open');
});

// Rate limiting tests
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
  assert.ok(duration >= 500, `Expected delay >= 500ms, got ${duration}ms`);
  assert.ok(scope.isDone());
});

// Retry exhaustion tests
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
  assert.strictEqual(metrics.errors.byType['rate_limit_exhausted'], 1);
});

test('exhausts retries on persistent 5xx responses', async (t) => {
  const scope = nock('https://www.pro-football-reference.com')
    .get('/players/F/FantNo00.htm')
    .reply(503, 'Service Unavailable')
    .get('/players/F/FantNo00.htm')
    .reply(503, 'Service Unavailable')
    .get('/players/F/FantNo00.htm')
    .reply(503, 'Service Unavailable')
    .get('/players/F/FantNo00.htm')
    .reply(503, 'Service Unavailable');

  await assert.rejects(
    () => fetchWithPolicy('https://www.pro-football-reference.com/players/F/FantNo00.htm'),
    CircuitOpenError // Circuit should open before retries exhaust
  );

  const metrics = getMetrics();
  assert.strictEqual(metrics.errors.byType['http_503'], 3);
});

// Timeout tests
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
  assert.strictEqual(metrics.errors.byType['timeout'], 1);
});

// Metrics tests
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
  assert.strictEqual(metrics.requests.byStatus[400], 1); // 429 is in 400 class
  assert.strictEqual(metrics.rateLimits.hits, 1);
  assert.strictEqual(metrics.retries.scheduled, 1);
  assert.strictEqual(metrics.deferrals.count, 1);
  assert.strictEqual(metrics.activeRequests, 0);
});

// Concurrency tests
test('tracks active requests correctly', async (t) => {
  const scope = nock('https://example.com')
    .get('/slow1')
    .delay(100)
    .reply(200, 'OK')
    .get('/slow2')
    .delay(100)
    .reply(200, 'OK');
  
  const promises = [
    fetchWithPolicy('https://example.com/slow1'),
    fetchWithPolicy('https://example.com/slow2')
  ];
  
  // Check metrics while requests are in flight
  await timers.setTimeout(50);
  const midMetrics = getMetrics();
  assert.ok(midMetrics.activeRequests > 0, 'Should have active requests');
  
  await Promise.all(promises);
  
  const finalMetrics = getMetrics();
  assert.strictEqual(finalMetrics.activeRequests, 0, 'Should have no active requests');
  assert.ok(scope.isDone());
});

// Integration test with mixed responses
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

// Error propagation tests
test('propagates network errors correctly', async (t) => {
  const scope = nock('https://example.com')
    .get('/error')
    .replyWithError('ECONNREFUSED');
  
  await assert.rejects(
    () => fetchWithPolicy('https://example.com/error'),
    (err) => {
      assert.ok(err instanceof NetworkError);
      assert.ok(err.message.includes('ECONNREFUSED'));
      return true;
    }
  );
  
  const metrics = getMetrics();
  assert.strictEqual(metrics.errors.byType['network_error'], 1);
});

// Edge case: rapid successive requests to same host
test('handles rapid successive requests correctly', async (t) => {
  const scope = nock('https://example.com')
    .get('/1').reply(200, 'OK')
    .get('/2').reply(200, 'OK')
    .get('/3').reply(200, 'OK')
    .get('/4').reply(200, 'OK')
    .get('/5').reply(200, 'OK');
  
  const promises = [];
  for (let i = 1; i <= 5; i++) {
    promises.push(fetchWithPolicy(`https://example.com/${i}`));
  }
  
  const responses = await Promise.all(promises);
  assert.strictEqual(responses.length, 5);
  responses.forEach(r => assert.strictEqual(r.status, 200));
  assert.ok(scope.isDone());
});

// Edge case: empty response body
test('handles empty response body', async (t) => {
  const scope = nock('https://example.com')
    .get('/empty')
    .reply(200, '');
  
  const response = await fetchWithPolicy('https://example.com/empty');
  assert.strictEqual(response.status, 200);
  const text = await response.text();
  assert.strictEqual(text, '');
  assert.ok(scope.isDone());
});

// Edge case: large response headers
test('handles large response headers', async (t) => {
  const largeHeader = 'x'.repeat(8000); // 8KB header
  const scope = nock('https://example.com')
    .get('/large-headers')
    .reply(200, 'OK', {
      'X-Large': largeHeader
    });
  
  const response = await fetchWithPolicy('https://example.com/large-headers');
  assert.strictEqual(response.status, 200);
  assert.ok(scope.isDone());
});

// Memory cleanup tests
test('cleans up resources on repeated use', async (t) => {
  // Make many requests to trigger cleanup logic
  for (let i = 0; i < 10; i++) {
    const scope = nock(`https://host${i}.example.com`)
      .get('/')
      .reply(200, 'OK');
    
    await fetchWithPolicy(`https://host${i}.example.com/`);
    assert.ok(scope.isDone());
  }
  
  // Force cleanup
  cleanup();
  
  const metrics = getMetrics();
  assert.ok(metrics.limiters.length <= 10, 'Should not leak limiters');
  assert.ok(metrics.circuits.length <= 10, 'Should not leak circuits');
});

// Idempotency test
test('multiple retries are idempotent', async (t) => {
  let requestCount = 0;
  const scope = nock('https://example.com')
    .get('/idempotent')
    .times(4)
    .reply(() => {
      requestCount++;
      if (requestCount < 3) {
        return [503, 'Service Unavailable'];
      }
      return [200, 'Success'];
    });
  
  const response = await fetchWithPolicy('https://example.com/idempotent');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(requestCount, 3);
  assert.ok(scope.isDone());
});

// Correlation ID propagation
test('propagates correlation ID correctly', async (t) => {
  const correlationId = randomUUID();
  let capturedHeaders;
  
  const scope = nock('https://example.com')
    .get('/')
    .reply(function() {
      capturedHeaders = this.req.headers;
      return [200, 'OK'];
    });
  
  await fetchWithPolicy('https://example.com/', { correlationId });
  
  assert.strictEqual(capturedHeaders['x-correlation-id'], correlationId);
  assert.ok(capturedHeaders['x-request-id']);
  assert.ok(scope.isDone());
});

// Custom headers preservation
test('preserves custom headers', async (t) => {
  let capturedHeaders;
  
  const scope = nock('https://example.com')
    .get('/')
    .reply(function() {
      capturedHeaders = this.req.headers;
      return [200, 'OK'];
    });
  
  await fetchWithPolicy('https://example.com/', {
    headers: {
      'X-Custom': 'value',
      'Authorization': 'Bearer token'
    }
  });
  
  assert.strictEqual(capturedHeaders['x-custom'], 'value');
  assert.strictEqual(capturedHeaders['authorization'], 'Bearer token');
  assert.ok(capturedHeaders['user-agent'].includes('EdgeScraper'));
  assert.ok(scope.isDone());
});

// Jitter test
test('applies jitter to delays', async (t) => {
  const delays = [];
  
  for (let i = 0; i < 5; i++) {
    const scope = nock('https://example.com')
      .get(`/${i}`)
      .reply(200, 'OK');
    
    const start = Date.now();
    await fetchWithPolicy(`https://example.com/${i}`);
    const delay = Date.now() - start;
    delays.push(delay);
    assert.ok(scope.isDone());
  }
  
  // Check that delays have some variation due to jitter
  const uniqueDelays = new Set(delays);
  assert.ok(uniqueDelays.size > 1, 'Delays should have variation due to jitter');
});