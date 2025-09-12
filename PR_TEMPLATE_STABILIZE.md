# stabilize/v2.0-production-flow — SSR + CORS/Auth + HTTP client unification

## Summary

* ✅ Switch to SSR via `@netlify/plugin-nextjs`
* ✅ Implement origin-reflecting CORS + cookie/Bearer auth for functions
* ✅ Port enhanced HTTP client to TS; typed config + consistent backoff/circuit behavior
* ✅ Robots toggle; dependency hygiene; tests (unit + e2e)

## Changes Made

### 1. Netlify SSR Configuration
- Added `@netlify/plugin-nextjs` dependency
- Updated `netlify.toml` to use `.next` directory instead of `out`
- Removed `next export` from build script
- Added plugin configuration for proper Next.js SSR support

### 2. CORS + Auth Utilities
- Created `/src/lib/http/cors.ts` with dynamic origin reflection
- Created `/src/lib/auth/token.ts` for unified token extraction (Bearer + cookie)
- Updated `fetch-url.js` to use new utilities
- All responses now include proper CORS headers with `Vary: Origin`

### 3. HTTP Client Unification
- Ported `simple-enhanced-client.js` to TypeScript in `/src/lib/http/client.ts`
- Full typed configuration with environment variable support
- Circuit breaker with half-open state
- 429 handling with Retry-After header support
- Metrics tracking and TTL-based cleanup
- Created TypeScript error types in `/src/lib/http/errors.ts`

### 4. Robots.txt Handling
- Added `respectRobots` parameter to fetch-url function (default: true)
- Logs warning when bypassing robots check
- Maintains backward compatibility

### 5. Dependency Cleanup
- Removed `node-fetch` dependency (using native fetch in Node 18+)

### 6. Testing Infrastructure
- Added Jest configuration for unit tests
- Created unit tests for:
  - CORS headers functionality
  - Auth token extraction
  - HTTP client with circuit breaker
- Added Playwright E2E tests for scrape flow
- Added test scripts to package.json

### 7. Observability
- Enhanced health endpoint with correlation IDs
- All functions return `x-correlation-id` header
- Health check includes environment info and timestamps

## Risks

* **SSR path changes** - Application now requires Node.js runtime on Netlify (not static)
* **Auth gate misconfig** - Missing env vars will cause auth failures

## Rollback Plan

1. Remove `@netlify/plugin-nextjs` from package.json
2. Revert `netlify.toml` to use `publish = "out"`
3. Re-add `next export` to build script
4. Restore old CORS headers in functions

## Environment Variables Required

```
ALLOWED_ORIGINS=https://edgescraperpro.com,https://www.edgescraperpro.com,http://localhost:3000
JWT_SECRET=<existing secret>
HTTP_DEADLINE_MS=30000
HTTP_MAX_RETRIES=4
HTTP_BASE_BACKOFF_MS=500
HTTP_MAX_BACKOFF_MS=10000
HTTP_JITTER_FACTOR=0.25
HTTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
HTTP_CIRCUIT_BREAKER_COOLDOWN_MS=60000
```

## Testing

### Local Testing
```bash
npm run type-check  # TypeScript validation
npm run lint        # ESLint checks
npm test           # Unit tests
npm run e2e        # E2E tests (requires running dev server)
```

### Deploy Testing
1. Push to branch for Netlify deploy preview
2. Test scrape flow on preview URL
3. Verify no CORS errors in browser console
4. Check network tab for proper headers

## Acceptance Criteria

- [x] Netlify build completes without errors
- [x] SSR pages render with content (not blank)
- [x] CORS headers reflect origin properly
- [x] Auth works with both Bearer token and cookie
- [x] HTTP client respects rate limits and circuit breaker
- [x] All tests pass
- [ ] Deploy preview tested successfully
- [ ] Production deploy verified