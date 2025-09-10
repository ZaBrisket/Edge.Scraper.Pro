# HTTP Client Enhancements for 429 Rate Limiting

## Overview

This document describes the enhanced HTTP client implementation that properly handles HTTP 429 (Too Many Requests) responses and prevents them from being treated as fatal server errors.

## Problem Solved

The original implementation had two critical issues:

1. **429 → 500 Error Mapping**: HTTP 429 responses were being mapped to 500 server errors
2. **Circuit Breaker Misconfiguration**: 429 responses were counting toward circuit breaker failure thresholds

This caused legitimate rate limiting to be treated as fatal failures, leading to circuit breaker activation and complete service disruption.

## Solution Architecture

### Enhanced HTTP Client (`src/lib/http/simple-enhanced-client.js`)

The enhanced client provides:

- **Per-host rate limiting** using token bucket algorithm
- **429-aware retry logic** with exponential backoff and jitter
- **Retry-After header support** for precise timing
- **Circuit breaker hygiene** that excludes 429s from failure counts
- **Comprehensive metrics** for observability
- **Configurable timeouts and limits**

### Key Features

#### 1. Per-Host Rate Limiting

```javascript
// Configuration example
HOST_LIMITS: {
  'www.pro-football-reference.com': { rps: 0.5, burst: 1 },
  'default': { rps: 1.0, burst: 2 }
}
```

- Uses Bottleneck library for token bucket implementation
- Separate rate limits per hostname
- Configurable via environment variables

#### 2. 429 Response Handling

```javascript
if (res.status === 429) {
  const retryAfter = res.headers.get('Retry-After');
  const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
  
  // Schedule retry with proper backoff
  if (attempt < maxRetries) {
    const delay = calculateBackoff(attempt, retryAfterSeconds);
    await new Promise(resolve => setTimeout(resolve, delay));
    return await attemptFetch(attempt + 1);
  }
}
```

- Respects `Retry-After` header when present
- Falls back to exponential backoff with jitter
- Does NOT count toward circuit breaker failures

#### 3. Circuit Breaker Hygiene

```javascript
// Only count 5xx responses as circuit breaker failures
if (res.status >= 500) {
  circuit.failures++;
  if (circuit.failures >= config.CIRCUIT_BREAKER_THRESHOLD) {
    circuit.state = 'open';
  }
}
```

- 429 responses are excluded from failure counts
- Only genuine server errors (5xx) trigger circuit breaker
- Half-open state with limited trial calls

#### 4. Comprehensive Metrics

```javascript
const metrics = {
  requests: { total: 0, byHost: {}, byStatus: {} },
  rateLimits: { hits: 0, byHost: {} },
  retries: { scheduled: 0, byReason: {} },
  circuitBreaker: { stateChanges: 0, byHost: {} },
  deferrals: { count: 0, byHost: {} }
};
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_LIMIT__DEFAULT__RPS` | 1.0 | Default requests per second |
| `HOST_LIMIT__DEFAULT__BURST` | 2 | Default burst capacity |
| `HOST_LIMIT__www_pro_football_reference_com__RPS` | 0.5 | PFR-specific RPS limit |
| `HOST_LIMIT__www_pro_football_reference_com__BURST` | 1 | PFR-specific burst limit |
| `HTTP_MAX_RETRIES` | 3 | Maximum retry attempts |
| `HTTP_BASE_BACKOFF_MS` | 1000 | Base backoff delay in milliseconds |
| `HTTP_MAX_BACKOFF_MS` | 30000 | Maximum backoff delay |
| `HTTP_JITTER_FACTOR` | 0.1 | Jitter factor (0-1) |
| `HTTP_CIRCUIT_BREAKER_THRESHOLD` | 5 | Circuit breaker failure threshold |
| `HTTP_CIRCUIT_BREAKER_RESET_MS` | 30000 | Circuit breaker reset time |
| `HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | 3 | Half-open trial calls |

### Example Configuration

```bash
# Conservative PFR settings
HOST_LIMIT__www_pro_football_reference_com__RPS=0.5
HOST_LIMIT__www_pro_football_reference_com__BURST=1
HTTP_MAX_RETRIES=3
HTTP_BASE_BACKOFF_MS=2000
HTTP_MAX_BACKOFF_MS=30000
HTTP_CIRCUIT_BREAKER_THRESHOLD=5
```

## Usage

### Basic Usage

```javascript
const { fetchWithPolicy, getMetrics } = require('./src/lib/http/simple-enhanced-client');

// Fetch with automatic rate limiting and retry
const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm');

// Get metrics
const metrics = getMetrics();
console.log('Rate limit hits:', metrics.rateLimits.hits);
```

### Batch Processing

```javascript
const urls = [
  'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
  'https://www.pro-football-reference.com/players/B/BradyTo00.htm',
  // ... more URLs
];

const results = await Promise.allSettled(
  urls.map(url => fetchWithPolicy(url))
);

const successes = results.filter(r => r.status === 'fulfilled').length;
const failures = results.filter(r => r.status === 'rejected').length;
```

## Monitoring and Observability

### Metrics Available

- **`requests.total`**: Total HTTP requests made
- **`requests.byHost`**: Requests per hostname
- **`requests.byStatus`**: Requests by status code class (200, 400, 500, etc.)
- **`rateLimits.hits`**: Number of 429 responses received
- **`rateLimits.byHost`**: 429 responses per hostname
- **`retries.scheduled`**: Number of retries scheduled
- **`retries.byReason`**: Retries by reason (429, timeout, etc.)
- **`deferrals.count`**: Number of requests deferred due to rate limiting
- **`circuitBreaker.stateChanges`**: Circuit breaker state transitions

### Logging

The client provides structured logging with correlation IDs:

```json
{
  "level": 40,
  "time": 1757533127798,
  "correlationId": "101a7ec8-de08-4fed-896d-53f9fec3f6fe",
  "host": "www.pro-football-reference.com",
  "url": "https://www.pro-football-reference.com/players/A/AllenJo00.htm",
  "status": 429,
  "retryAfter": null,
  "attempt": 2,
  "msg": "Rate limited - will retry"
}
```

### Circuit Breaker States

- **`closed`**: Normal operation
- **`open`**: Circuit is open, requests are blocked
- **`half-open`**: Limited trial calls allowed

## Testing

### Unit Tests

```bash
npm test -- tests/enhanced-http-client.test.js
```

### Integration Tests

```bash
npm test -- tests/pfr-batch-integration.test.js
```

### Manual Testing

```bash
node test-pfr-scenario.js
```

## Migration Guide

### From Original Client

1. Replace `require('./src/lib/http/client')` with `require('./src/lib/http/simple-enhanced-client')`
2. Update configuration to use new environment variables
3. Update error handling to distinguish between rate limit and network errors
4. Add metrics collection for observability

### Error Handling Changes

```javascript
// Before
try {
  const response = await fetchWithPolicy(url);
} catch (error) {
  // All errors treated the same
}

// After
try {
  const response = await fetchWithPolicy(url);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting (non-fatal)
    console.log('Rate limited, will retry later');
  } else if (error instanceof NetworkError) {
    // Handle network/server errors (fatal)
    console.error('Network error:', error.message);
  }
}
```

## Performance Considerations

### Rate Limiting Impact

- **PFR**: 0.5 RPS = 2 seconds between requests
- **Default**: 1.0 RPS = 1 second between requests
- **Burst**: Allows initial burst of requests before rate limiting kicks in

### Memory Usage

- Limiters and circuits are cleaned up after 30 minutes of inactivity
- Metrics are kept in memory (consider external metrics collection for production)

### Timeout Configuration

- **Connect Timeout**: 5 seconds (configurable)
- **Read Timeout**: 10 seconds (configurable)
- **Total Request Time**: Connect + Read + Retry delays

## Troubleshooting

### Common Issues

1. **High Rate Limit Hits**: Reduce RPS or increase burst capacity
2. **Circuit Breaker Opening**: Check for genuine 5xx errors, not 429s
3. **Slow Processing**: Increase RPS limits or reduce retry delays
4. **Memory Usage**: Check for limiter/circuit cleanup

### Debug Mode

Set `LOG_LEVEL=debug` for detailed logging:

```bash
LOG_LEVEL=debug node your-script.js
```

### Metrics Monitoring

```javascript
const { getMetrics } = require('./src/lib/http/simple-enhanced-client');

setInterval(() => {
  const metrics = getMetrics();
  console.log('Rate limit hits:', metrics.rateLimits.hits);
  console.log('Circuit states:', metrics.circuits);
}, 30000); // Every 30 seconds
```

## Best Practices

1. **Start Conservative**: Begin with low RPS limits and increase gradually
2. **Monitor Metrics**: Watch rate limit hits and circuit breaker states
3. **Handle Errors Properly**: Distinguish between rate limits and network errors
4. **Use Correlation IDs**: For tracing requests across logs
5. **Test Thoroughly**: Use integration tests to verify behavior

## Future Enhancements

- [ ] Redis-based rate limiting for distributed systems
- [ ] Adaptive rate limiting based on response times
- [ ] Prometheus metrics export
- [ ] Circuit breaker health checks
- [ ] Request queuing for high-volume scenarios