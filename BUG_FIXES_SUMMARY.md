# Bug Fixes Summary for Universal M&A News Scraper

## Issues Fixed

### 1. P0: node-fetch v3 CommonJS Import Issue
**Problem**: The code was using `require('node-fetch')` with node-fetch v3, which is an ES module and throws `ERR_REQUIRE_ESM`.

**Solution**: 
- Downgraded to node-fetch v2.7.0 which supports CommonJS
- Added fallback to use native fetch when available (Node 18+)
- Code now uses: `const fetch = globalThis.fetch || require('node-fetch');`

### 2. P1: Timeout Not Enforced
**Problem**: The timeout option was passed to fetch but ignored, allowing requests to hang indefinitely.

**Solution**:
- Implemented AbortController with proper timeout handling
- Each retry attempt gets a fresh AbortController
- Timeout is enforced via `setTimeout(() => controller.abort(), this.config.timeout)`
- Clear timeout error messaging: "Request timeout after {timeout}ms"

### 3. P1: Missing API Key Validation
**Problem**: The handler removed API key validation, exposing the endpoint to unauthenticated use.

**Solution**:
- Restored API key validation at the beginning of the handler
- Checks `x-api-key` header against `PUBLIC_API_KEY` environment variable
- Respects `BYPASS_AUTH` environment variable for development
- Returns 401 status for invalid/missing API key

### 4. URL Validation Crash
**Problem**: Invalid URLs would crash `getSiteProfile` when calling `new URL()`.

**Solution**:
- Added explicit URL validation before calling any other functions
- Validates URL format and protocol (http/https only)
- Returns 400 status with clear error message for invalid URLs
- Prevents downstream crashes from malformed URLs

## Code Changes

### `/workspace/src/lib/http/universal-client.js`
- Replaced ES module import with CommonJS-compatible approach
- Added AbortController for timeout enforcement
- Fixed retry logic to use fresh AbortController per attempt

### `/workspace/netlify/functions/fetch-url.js`
- Restored API key validation
- Added URL format validation
- Improved error responses

### `/workspace/package.json`
- Changed node-fetch from v3 to v2.7.0 for CommonJS compatibility

## Testing

Run the bug fix verification script:
```bash
node test-bug-fixes.js
```

This will verify:
1. ✓ Fetch module loads correctly
2. ✓ Timeouts are properly enforced
3. ✓ Invalid URLs are rejected
4. ✓ Site profiles handle gracefully

## Environment Variables

Ensure these are set in production:
- `PUBLIC_API_KEY`: API key for authentication
- `BYPASS_AUTH`: Set to "true" only in development
- `PROXY_URL`: Optional proxy for certain sites

## Deployment

```bash
# Install dependencies
npm ci

# Test fixes
node test-bug-fixes.js

# Deploy
git add .
git commit -m "Fix P0/P1 bugs: node-fetch import, timeout enforcement, API auth, URL validation"
git push origin main
```