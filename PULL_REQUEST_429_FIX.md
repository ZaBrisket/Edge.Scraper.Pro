# Pull Request: Fix PFR 429 Rate Limit Handling

## Summary
This PR addresses the critical issue where Pro-Football-Reference (PFR) rate limit responses (HTTP 429) were being incorrectly mapped to 500 server errors, causing unnecessary circuit breaker trips and batch failures.

## Problem
- **35 server errors** on 2025-09-10 for PFR player pages
- 429 responses mapped to 500 errors: `[500] Upstream 429`
- Circuit breaker opening due to rate limits: `[500] Circuit ... is open`
- Batch processing failures despite recoverable rate limit conditions

## Solution Implemented

### 1. Proper 429 Error Handling
- 429 responses now throw `RateLimitError` instead of being mapped to 500
- Rate limit errors don't count toward circuit breaker failure threshold
- Added support for parsing and respecting `Retry-After` headers

### 2. Per-Host Rate Limiting
- Implemented token bucket rate limiting using Bottleneck
- Configurable per-host RPS and burst capacity
- Safe defaults for PFR: 0.5 RPS with burst of 2

### 3. Enhanced Circuit Breaker
- Only opens on genuine failures (5xx errors and timeouts)
- Added half-open state for gradual recovery
- 429 responses explicitly excluded from failure counting

### 4. Comprehensive Observability
- New metrics: `rate_limit.hit`, `http.rate_limited`, `retry.scheduled`
- Circuit state transitions tracked
- Request duration and status metrics

### 5. Configuration System
- All limits configurable via environment variables
- Per-host configuration pattern: `HOST_LIMIT__<hostname>__RPS`
- Safe defaults with override capability

## Files Changed

### Core Implementation
- `/src/lib/config.js` - Added per-host rate limit configuration
- `/src/lib/http/client.js` - Rewrote with proper 429 handling and rate limiting
- `/src/lib/http/metrics.js` - New metrics collection system

### Documentation
- `/docs/incidents/2025-09-10-pfr-429.md` - Incident analysis report
- `/docs/RATE_LIMIT_RUNBOOK.md` - Operational runbook for rate limiting
- `/README.md` - Updated with rate limiting documentation

### Testing
- `/tests/http-client-429.test.js` - Comprehensive test suite
- `/tools/analyze_errors.js` - Error log analysis tool

## Testing
```bash
# Run tests
node tests/http-client-429.test.js

# Key test scenarios:
- 429 responses don't open circuit breaker ✓
- Retry-After header respected ✓
- Rate limiter enforces limits ✓
- Circuit opens only on 5xx/timeouts ✓
- PFR batch simulation succeeds ✓
```

## Configuration
```bash
# PFR-specific rate limits (safe defaults)
export HOST_LIMIT__www_pro_football_reference_com__RPS=0.5
export HOST_LIMIT__www_pro_football_reference_com__BURST=2

# General HTTP settings
export HTTP_MAX_RETRIES=3
export HTTP_CIRCUIT_BREAKER_THRESHOLD=5
export HTTP_RETRY_MAX_DELAY_MS=60000
```

## Verification
Running a batch of 100+ PFR URLs now:
- ✅ 0 fatal 500s from 429 conditions
- ✅ Circuit breaker remains closed
- ✅ All requests eventually succeed
- ✅ Clear metrics on rate limiting and retries

## Rollout Plan
1. Deploy with conservative PFR limits (0.5 RPS)
2. Monitor metrics for 24 hours
3. Gradually increase limits based on observed behavior
4. Document any new rate limit patterns

## Monitoring
Key metrics to watch:
- `rate_limit.hit{host:www.pro-football-reference.com}`
- `http.rate_limited{host:www.pro-football-reference.com}`
- `circuit.state{host:www.pro-football-reference.com}`
- `retry.scheduled{reason:429_retry_after}`

## Breaking Changes
None - the HTTP client interface remains unchanged. All improvements are internal.

## Future Improvements
- [ ] Add caching layer to reduce repeat requests
- [ ] Implement request deduplication within batches
- [ ] Add dashboard for real-time rate limit monitoring
- [ ] Consider implementing request priority queues