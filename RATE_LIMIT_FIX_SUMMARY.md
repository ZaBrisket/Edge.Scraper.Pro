# Rate Limiting and Circuit Breaker Fixes

## Problem Analysis

The error report showed 39 server errors when scraping pro-football-reference.com:
- **Primary Issue**: "Upstream 429" rate limiting errors
- **Secondary Issue**: "Circuit for www.pro-football-reference.com is open" errors
- **Root Cause**: Aggressive request patterns overwhelming the upstream server

## Fixes Implemented

### 1. Enhanced Rate Limit Handling

**File**: `src/lib/http/client.js`

- **Separated 429 from Circuit Breaker Logic**: Rate limit errors (429) no longer count toward circuit breaker failures
- **Improved Retry Logic**: Added intelligent exponential backoff for 429 responses
- **Retry-After Header Support**: Respects server-provided retry delays when available
- **Enhanced Logging**: Better visibility into rate limiting scenarios

```javascript
// 429 errors don't trigger circuit breaker
if (res.status === 429) {
  const retryAfter = res.headers.get('Retry-After');
  // ... handle with backoff, don't count as circuit failure
}
```

### 2. Circuit Breaker Configuration

**File**: `src/lib/config.js`

- **Increased Failure Threshold**: From 5 to 10 failures before opening circuit
- **Extended Reset Time**: From 30s to 60s for circuit recovery
- **Separate Error Types**: Only 5xx errors and timeouts count toward circuit breaker

```javascript
HTTP_CIRCUIT_BREAKER_THRESHOLD: default(10)  // was 5
HTTP_CIRCUIT_BREAKER_RESET_MS: default(60000) // was 30000
```

### 3. Conservative Rate Limiting

**File**: `src/lib/config.js`

- **Reduced RPS for PFR**: From 0.5 to 0.3 requests per second
- **Maintained Burst Limit**: Kept at 1 to prevent bursts
- **Increased Backoff Times**: More aggressive backoff for retries

```javascript
HOST_LIMIT__www_pro_football_reference_com__RPS: default(0.3)    // was 0.5
HTTP_BASE_BACKOFF_MS: default(2000)  // was 1000
HTTP_MAX_BACKOFF_MS: default(60000)  // was 30000
```

### 4. Enhanced HTTP Client Usage

**File**: `netlify/functions/fetch-url.js`

- **Switched to Enhanced Client**: Now uses `enhanced-client.js` instead of basic `client.js`
- **Better 429 Handling**: The enhanced client has more sophisticated retry logic
- **Improved Metrics**: Better tracking of rate limiting events

### 5. Request Throttling Improvements

**Files**: `src/lib/http/client.js`, `src/lib/http/enhanced-client.js`

- **Host-Specific Limits**: Different rate limits per domain
- **Conservative Concurrency**: Reduced to 1 concurrent request per host
- **Better User Agent**: More descriptive and respectful user agent string
- **Request Spacing**: Added jitter to prevent synchronized request patterns

## Expected Outcomes

### Immediate Improvements
1. **Reduced 429 Errors**: Conservative rate limiting prevents overwhelming the server
2. **No More Circuit Breaker Issues**: 429s don't trigger circuit breaker opening
3. **Better Retry Behavior**: Intelligent backoff reduces wasted retry attempts
4. **Improved Success Rate**: More requests succeed after appropriate delays

### Long-term Benefits
1. **Sustainable Scraping**: Respectful request patterns maintain access
2. **Better Error Recovery**: Circuit breaker only opens for real failures
3. **Improved Monitoring**: Better logging and metrics for troubleshooting
4. **Scalable Architecture**: Per-host rate limiting supports multiple domains

## Testing Results

The unit test confirms all fixes are properly configured:

```
✅ pro-football-reference.com RPS: 0.3 (conservative)
✅ Circuit breaker threshold: 10 (increased tolerance)
✅ Circuit breaker reset: 60s (longer recovery)
✅ Backoff range: 2s - 60s (more aggressive)
✅ Error handling: Proper separation of error types
```

## Monitoring Recommendations

1. **Track Success Rates**: Monitor the ratio of successful vs failed requests
2. **Watch Circuit Breaker State**: Ensure circuits aren't opening frequently
3. **Monitor Backoff Times**: Verify retry delays are appropriate
4. **Log Rate Limit Events**: Keep track of 429 responses and retry patterns

## Configuration Tuning

If issues persist, consider further adjustments:

- **Reduce RPS**: Lower from 0.3 to 0.2 or 0.1
- **Increase Delays**: Add mandatory delays between requests
- **Implement Request Queuing**: Serialize requests more strictly
- **Add Request Budgets**: Limit total requests per time period

## Files Modified

- `src/lib/config.js` - Updated rate limits and circuit breaker settings
- `src/lib/http/client.js` - Enhanced 429 handling and retry logic
- `netlify/functions/fetch-url.js` - Switched to enhanced HTTP client
- `test-fixes-unit.js` - Unit test to verify configuration
- `RATE_LIMIT_FIX_SUMMARY.md` - This documentation

These fixes should resolve the 429 rate limiting errors and prevent circuit breaker issues while maintaining reliable access to pro-football-reference.com.