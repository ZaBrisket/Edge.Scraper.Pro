const http = require('http');
const { fetchWithPolicy } = require('../src/lib/http/client');
const { RateLimitError } = require('../src/lib/http/errors');

// Simple test server that always returns 429
const server = http.createServer((req, res) => {
  res.writeHead(429, { 'Retry-After': '1' });
  res.end('Rate limited');
});

async function test() {
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  
  console.log(`Test server listening on port ${port}`);
  
  try {
    // Test 1: 429 should throw RateLimitError
    console.log('\nTest 1: Checking 429 handling...');
    try {
      await fetchWithPolicy(`http://localhost:${port}/test`, { retries: 0 });
      console.log('ERROR: Should have thrown RateLimitError');
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.log('✓ Correctly threw RateLimitError for 429');
        console.log(`  - Error message: ${err.message}`);
        console.log(`  - Retry after: ${err.meta?.retryAfter}ms`);
      } else {
        console.log(`ERROR: Wrong error type: ${err.constructor.name}`);
      }
    }
    
    // Test 2: Check circuit breaker state
    console.log('\nTest 2: Checking circuit breaker...');
    const stats = fetchWithPolicy.getStats();
    const circuitState = stats.circuits[`localhost:${port}`]?.state || 'not found';
    console.log(`✓ Circuit breaker state: ${circuitState}`);
    if (circuitState === 'closed') {
      console.log('  - Circuit correctly remained closed after 429');
    } else {
      console.log('  - ERROR: Circuit should be closed!');
    }
    
    // Test 3: Check metrics
    console.log('\nTest 3: Checking metrics...');
    console.log('Metrics summary:', JSON.stringify(stats.metrics.counters, null, 2));
    
  } finally {
    server.close();
  }
}

test().catch(console.error);