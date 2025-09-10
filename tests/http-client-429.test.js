const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { fetchWithPolicy } = require('../src/lib/http/client');
const { RateLimitError, CircuitOpenError, TimeoutError } = require('../src/lib/http/errors');
const metrics = require('../src/lib/http/metrics');

// Helper to create test server
function createTestServer() {
  let requestCount = 0;
  let rateLimitUntil = 0;
  let serverErrorCount = 0;
  
  const server = http.createServer((req, res) => {
    requestCount++;
    
    // Simulate rate limiting
    if (rateLimitUntil > 0) {
      rateLimitUntil--;
      res.writeHead(429, { 
        'Retry-After': '2',
        'Content-Type': 'text/plain' 
      });
      res.end('Too Many Requests');
      return;
    }
    
    // Simulate server errors
    if (serverErrorCount > 0) {
      serverErrorCount--;
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    
    // Simulate slow response
    if (req.url === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Slow response');
      }, 5000);
      return;
    }
    
    // Normal response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      requestNumber: requestCount,
      url: req.url 
    }));
  });
  
  return {
    server,
    getRequestCount: () => requestCount,
    setRateLimitCount: (count) => { rateLimitUntil = count; },
    setServerErrorCount: (count) => { serverErrorCount = count; },
    reset: () => {
      requestCount = 0;
      rateLimitUntil = 0;
      serverErrorCount = 0;
    }
  };
}

test('429 responses should not open circuit breaker', async (t) => {
  const { server, setRateLimitCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/test`;
  
  try {
    // Reset metrics
    metrics.reset();
    
    // Set up 5 consecutive 429 responses
    setRateLimitCount(5);
    
    // Make requests that will get 429s
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        fetchWithPolicy(url, { retries: 0 }).catch(err => err)
      );
    }
    
    const errors = await Promise.all(promises);
    
    // All should be RateLimitError, not CircuitOpenError
    assert.strictEqual(errors.filter(e => e instanceof RateLimitError).length, 5);
    assert.strictEqual(errors.filter(e => e instanceof CircuitOpenError).length, 0);
    
    // Circuit should still be closed
    reset();
    const successRes = await fetchWithPolicy(url);
    assert.strictEqual(successRes.status, 200);
    
    // Check metrics
    const stats = metrics.getStats();
    assert(stats.counters['http.rate_limited{host:localhost}'] >= 5);
    assert(!stats.counters['circuit.transition{host:localhost,from:closed,to:open}']);
    
  } finally {
    server.close();
  }
});

test('429 with Retry-After should delay appropriately', async (t) => {
  const { server, setRateLimitCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/test`;
  
  try {
    metrics.reset();
    
    // First request gets 429, second succeeds
    setRateLimitCount(1);
    
    const startTime = Date.now();
    const res = await fetchWithPolicy(url, { retries: 1 });
    const duration = Date.now() - startTime;
    
    assert.strictEqual(res.status, 200);
    // Should have waited at least 2 seconds (from Retry-After) plus some jitter
    assert(duration >= 2000, `Expected delay >= 2000ms, got ${duration}ms`);
    
    // Check retry was scheduled
    const stats = metrics.getStats();
    assert(stats.counters['retry.scheduled{host:localhost,reason:429_retry_after}'] >= 1);
    
  } finally {
    server.close();
  }
});

test('Circuit breaker should open on 5xx errors', async (t) => {
  const { server, setServerErrorCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/test`;
  
  try {
    metrics.reset();
    
    // Set threshold to 3 for faster testing
    process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD = '3';
    
    // Trigger 3 server errors
    setServerErrorCount(10);
    
    const errors = [];
    for (let i = 0; i < 4; i++) {
      try {
        await fetchWithPolicy(url, { retries: 0 });
      } catch (err) {
        errors.push(err);
      }
    }
    
    // First 3 should be NetworkError, 4th should be CircuitOpenError
    assert.strictEqual(errors.length, 4);
    assert(errors[3] instanceof CircuitOpenError);
    
    // Check circuit opened
    const stats = fetchWithPolicy.getStats();
    assert.strictEqual(stats.circuits[`localhost:${port}`].state, 'open');
    
  } finally {
    server.close();
    delete process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD;
  }
});

test('Rate limiter should respect per-host limits', async (t) => {
  const { server, getRequestCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/test`;
  
  try {
    metrics.reset();
    reset();
    
    // Set very low rate limit for localhost
    process.env.HOST_LIMIT__localhost__RPS = '2';
    process.env.HOST_LIMIT__localhost__BURST = '2';
    
    // Make 5 rapid requests
    const startTime = Date.now();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(fetchWithPolicy(url + `?req=${i}`));
    }
    
    await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    // With 2 RPS and burst of 2, 5 requests should take at least 1.5 seconds
    // (2 immediate, then 3 more at 2/sec = 1.5s)
    assert(duration >= 1500, `Expected duration >= 1500ms, got ${duration}ms`);
    
    // All requests should succeed
    assert.strictEqual(getRequestCount(), 5);
    
  } finally {
    server.close();
    delete process.env.HOST_LIMIT__localhost__RPS;
    delete process.env.HOST_LIMIT__localhost__BURST;
  }
});

test('Exponential backoff with jitter on network errors', async (t) => {
  const { server, setServerErrorCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/test`;
  
  try {
    metrics.reset();
    
    // First 2 requests fail, 3rd succeeds
    setServerErrorCount(2);
    
    const startTime = Date.now();
    const res = await fetchWithPolicy(url, { retries: 2 });
    const duration = Date.now() - startTime;
    
    assert.strictEqual(res.status, 200);
    
    // Should have some delay from backoff (but with jitter, exact timing varies)
    assert(duration >= 500, `Expected some backoff delay, got ${duration}ms`);
    
    // Check retries were scheduled
    const stats = metrics.getStats();
    assert(stats.counters['retry.scheduled{host:localhost,reason:NETWORK_ERROR}'] >= 2);
    
  } finally {
    server.close();
  }
});

test('Timeout errors should count toward circuit breaker', async (t) => {
  const { server, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://localhost:${port}/slow`;
  
  try {
    metrics.reset();
    
    // Set threshold to 2 for faster testing
    process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD = '2';
    
    const errors = [];
    for (let i = 0; i < 3; i++) {
      try {
        await fetchWithPolicy(url, { timeout: 100, retries: 0 });
      } catch (err) {
        errors.push(err);
      }
    }
    
    // First 2 should be TimeoutError, 3rd should be CircuitOpenError
    assert.strictEqual(errors.length, 3);
    assert(errors[0] instanceof TimeoutError);
    assert(errors[1] instanceof TimeoutError);
    assert(errors[2] instanceof CircuitOpenError);
    
  } finally {
    server.close();
    delete process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD;
  }
});

test('Integration: PFR-like batch with mixed responses', async (t) => {
  const { server, setRateLimitCount, setServerErrorCount, getRequestCount, reset } = createTestServer();
  
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  
  try {
    metrics.reset();
    reset();
    
    // Simulate PFR-like scenario
    const playerUrls = [
      '/players/A/AlleJo00.htm',
      '/players/B/BradTo00.htm',
      '/players/M/MahoPa00.htm',
      '/players/R/RodgAa00.htm',
      '/players/W/WilsRu00.htm',
    ];
    
    // Set up scenario: 2 rate limits, then success
    setRateLimitCount(2);
    
    const results = await Promise.all(
      playerUrls.map(async (path) => {
        try {
          const res = await fetchWithPolicy(`http://localhost:${port}${path}`, { retries: 2 });
          const body = await res.json();
          return { path, success: true, data: body };
        } catch (err) {
          return { path, success: false, error: err.code || err.message };
        }
      })
    );
    
    // All should eventually succeed
    const successful = results.filter(r => r.success);
    assert.strictEqual(successful.length, 5);
    
    // Check no circuit breaker issues
    const stats = fetchWithPolicy.getStats();
    assert.strictEqual(stats.circuits[`localhost:${port}`].state, 'closed');
    
    // Should have seen some rate limits but recovered
    assert(stats.counters['http.rate_limited{host:localhost}'] >= 2);
    assert(stats.counters['http.success{host:localhost,status:200}'] >= 5);
    
    console.log('PFR batch test summary:');
    console.log(`- Total requests made: ${getRequestCount()}`);
    console.log(`- Successful: ${successful.length}/5`);
    console.log(`- Rate limited: ${stats.counters['http.rate_limited{host:localhost}'] || 0}`);
    console.log(`- Circuit state: ${stats.circuits[`localhost:${port}`].state}`);
    
  } finally {
    server.close();
  }
});

// Run all tests
if (require.main === module) {
  test.run();
}