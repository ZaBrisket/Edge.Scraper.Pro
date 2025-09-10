# Rate Limiting & HTTP Client Runbook

## Overview
This document provides operational guidance for the improved HTTP client with rate limiting, 429 handling, and circuit breaker functionality.

## Quick Start

### Using the HTTP Client
```javascript
const { fetchWithPolicy } = require('./src/lib/http/client');

// Basic usage
const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/M/MahoPa00.htm');

// With options
const response = await fetchWithPolicy(url, {
  timeout: 5000,      // 5 second timeout
  retries: 3,         // Retry up to 3 times
  correlationId: 'batch-123'  // For request tracing
});
```

## Configuration

### Environment Variables

#### Global HTTP Settings
- `HTTP_DEADLINE_MS` - Request timeout in milliseconds (default: 10000)
- `HTTP_MAX_RETRIES` - Maximum retry attempts (default: 3)
- `HTTP_CIRCUIT_BREAKER_THRESHOLD` - Failures before opening circuit (default: 5)
- `HTTP_CIRCUIT_BREAKER_RESET_MS` - Time before trying half-open (default: 30000)
- `HTTP_RETRY_MAX_DELAY_MS` - Maximum backoff delay (default: 60000)
- `HTTP_USER_AGENT` - User agent string (default: 'edge-scraper/2.0')

#### Per-Host Rate Limits
Format: `HOST_LIMIT__<hostname>__<metric>`
- Replace dots and hyphens in hostname with underscores
- Metrics: `RPS` (requests per second), `BURST` (burst capacity)

Example for Pro-Football-Reference:
```bash
export HOST_LIMIT__www_pro_football_reference_com__RPS=0.5
export HOST_LIMIT__www_pro_football_reference_com__BURST=2
```

Default limits (for unknown hosts):
```bash
export HOST_LIMIT__DEFAULT__RPS=2
export HOST_LIMIT__DEFAULT__BURST=5
```

## Monitoring & Metrics

### Key Metrics
The HTTP client emits the following metrics:

1. **Request Metrics**
   - `http.requests{host,attempt}` - Total requests (initial vs retry)
   - `http.success{host,status}` - Successful responses
   - `http.rate_limited{host}` - 429 responses received
   - `http.server_error{host,status}` - 5xx responses
   - `http.timeout{host}` - Timeout errors
   - `http.error{host,error}` - Other errors

2. **Rate Limiter Metrics**
   - `rate_limit.hit{host}` - When rate limiter blocks/queues request

3. **Retry Metrics**
   - `retry.scheduled{host,reason}` - Retries scheduled (429_retry_after, NETWORK_ERROR, etc)

4. **Circuit Breaker Metrics**
   - `circuit.transition{host,from,to}` - State changes (closed→open, open→half_open, etc)
   - `circuit.open_rejection{host}` - Requests rejected due to open circuit

5. **Performance Metrics**
   - `http.request_duration{host,status}` - Request duration in milliseconds

### Viewing Metrics
```javascript
const { fetchWithPolicy } = require('./src/lib/http/client');

// Get current stats
const stats = fetchWithPolicy.getStats();
console.log(JSON.stringify(stats, null, 2));

// Stats include:
// - limiters: Current state of rate limiters per host
// - circuits: Circuit breaker states per host  
// - metrics: Counters and timers
```

### Enable Debug Logging
```bash
export DEBUG_METRICS=true  # Log all metrics to console
export NODE_ENV=development  # Enable development mode
```

## Operational Procedures

### Tuning Rate Limits

1. **Identify the problematic host** from error logs or metrics
2. **Check current limits**:
   ```javascript
   const config = require('./src/lib/config');
   console.log(config.getHostLimits('www.pro-football-reference.com'));
   ```

3. **Adjust limits** via environment variables:
   ```bash
   # More conservative (slower but safer)
   export HOST_LIMIT__www_pro_football_reference_com__RPS=0.25
   export HOST_LIMIT__www_pro_football_reference_com__BURST=1
   
   # More aggressive (faster but may hit limits)
   export HOST_LIMIT__www_pro_football_reference_com__RPS=1
   export HOST_LIMIT__www_pro_football_reference_com__BURST=5
   ```

4. **Monitor impact** via metrics

### Handling 429 Errors

When you see 429 errors:

1. **Check if they're being deferred** (not fatal):
   - Look for `retry.scheduled{reason:429_retry_after}` metrics
   - Ensure requests eventually succeed

2. **Verify circuit breaker isn't opening**:
   - Circuit state should remain 'closed' for 429s
   - Only 5xx/timeouts should open circuit

3. **Tune rate limits** if getting many 429s:
   - Reduce RPS for that host
   - Increase retry delays

### Circuit Breaker Management

1. **Check circuit states**:
   ```javascript
   const stats = fetchWithPolicy.getStats();
   console.log(stats.circuits);
   ```

2. **States explained**:
   - `closed` - Normal operation
   - `open` - Rejecting requests due to failures
   - `half-open` - Testing with limited traffic

3. **Manual intervention** (if needed):
   - Circuits auto-reset after `HTTP_CIRCUIT_BREAKER_RESET_MS`
   - Restart process to force reset all circuits

## Troubleshooting

### Common Issues

1. **"Circuit for X is open"**
   - Too many 5xx errors or timeouts
   - Check upstream service health
   - May need to increase timeout or adjust thresholds

2. **"Rate limited" but no retries**
   - Check retry budget (`HTTP_MAX_RETRIES`)
   - Verify Retry-After header is reasonable
   - Look at retry delay calculations

3. **Requests taking too long**
   - Rate limiter may be queuing
   - Check `rate_limit.hit` metrics
   - Consider increasing RPS limits

4. **Memory usage growing**
   - Limiters/circuits have TTL (30/15 minutes)
   - Cleanup runs every 5 minutes
   - Check for unusual number of unique hosts

### Debug Commands

```bash
# Run with full debug output
DEBUG_METRICS=true node your-script.js

# Test specific host limits
cat > test-limits.js << 'EOF'
const config = require('./src/lib/config');
const host = process.argv[2] || 'www.pro-football-reference.com';
console.log(`Limits for ${host}:`, config.getHostLimits(host));
EOF
node test-limits.js example.com
```

## Best Practices

1. **Start Conservative**: Begin with low rate limits and increase gradually
2. **Monitor Metrics**: Watch for patterns before issues become critical
3. **Respect Retry-After**: The upstream service knows best
4. **Use Correlation IDs**: Makes tracing issues much easier
5. **Set Appropriate Timeouts**: Balance between patience and resource usage

## Example: Batch Processing

```javascript
const { fetchWithPolicy } = require('./src/lib/http/client');

async function processBatch(urls) {
  console.log(`Processing ${urls.length} URLs...`);
  
  const results = await Promise.allSettled(
    urls.map(url => 
      fetchWithPolicy(url, { 
        retries: 3,
        correlationId: `batch-${Date.now()}`
      })
    )
  );
  
  const stats = fetchWithPolicy.getStats();
  
  console.log('Batch complete:');
  console.log(`- Successful: ${results.filter(r => r.status === 'fulfilled').length}`);
  console.log(`- Failed: ${results.filter(r => r.status === 'rejected').length}`);
  console.log(`- Rate limited: ${stats.metrics.counters['http.rate_limited{host:www.pro-football-reference.com}'] || 0}`);
  console.log(`- Circuit state:`, stats.circuits);
  
  return results;
}
```