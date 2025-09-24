# fetch-url Hardening

This update strengthens the reliability and performance of the `/.netlify/functions/fetch-url` endpoint while keeping its external contract (proxying the upstream body) unchanged.

## What changed
- **Timeouts** – All upstream calls now use `AbortController` timeouts. The GET request honors `HTTP_DEADLINE_MS` (default 15 000 ms, hard-capped at 30 000 ms) and the HEAD preflight uses 5 000 ms.
- **Size cap** – Responses larger than `FETCH_URL_MAX_BYTES` (default 2 MiB) are rejected with **413**. A HEAD preflight checks `Content-Length` when available to fail fast.
- **SSRF guards** – Localhost, loopback, private, link-local, and common internal hostnames are rejected before any network call.
- **CORS consistency** – Uniform `Access-Control-Allow-*` headers with `OPTIONS` returning **204**.
- **Netlify CDN caching** – Adds `Netlify-CDN-Cache-Control: public, max-age=120, stale-while-revalidate=600` to reduce origin load for repeat requests.
- **Header hygiene** – Harmless upstream headers like `etag`/`last-modified` are preserved, while `Set-Cookie` and hop-by-hop headers are stripped. Content-Length is set explicitly.
- **Redirect safety** – Redirects are followed manually with hostname vetting, optional HTTPS→HTTP downgrade blocking, and a hard cap on hops (default 5).

## Redirect policy

- Redirects are resolved hop-by-hop using `followRedirectsSafely`, with `Location` headers validated via `safeParseUrl`.
- Each hop runs through the SSRF guard (`isBlockedHostname`) so redirects to localhost, private, link-local, IPv4-mapped IPv6, or denylisted domains are blocked with **403**.
- `FETCH_URL_BLOCK_DOWNGRADE=true` disallows HTTPS→HTTP redirects (blocked with `DOWNGRADE_BLOCKED`).
- `FETCH_URL_MAX_REDIRECTS` (default **5**, max **10**) limits redirect chains; exceeding it returns **502** (`TOO_MANY_REDIRECTS`).
- The denylist is suffix-based and defaults to `nip.io, sslip.io, localtest.me`; override via `FETCH_URL_DENYLIST`.
- `Server-Timing` reports per-hop durations (`t_head`, `t_get`) and redirect count for observability.

## Configuration
Optional environment variables with sensible defaults:

| Variable | Purpose | Default |
| --- | --- | --- |
| `BYPASS_AUTH` | Disable API key enforcement when `true`. | `false` |
| `PUBLIC_API_KEY` | Required API key when auth is enforced. | – |
| `HTTP_DEADLINE_MS` | Upstream GET timeout (ms). Min 1 000, max 30 000. | `15000` |
| `FETCH_URL_MAX_BYTES` | Hard cap for upstream response size (bytes). | `2097152` |
| `FETCH_URL_MAX_REDIRECTS` | Max redirect hops followed before failing. | `5` |
| `FETCH_URL_BLOCK_DOWNGRADE` | Block HTTPS→HTTP redirects when `true`. | `false` |
| `FETCH_URL_DENYLIST` | Comma-separated host suffix denylist (case-insensitive). | `nip.io,sslip.io,localtest.me` |
| `NETLIFY_CDN_MAX_AGE` | Seconds to cache in Netlify CDN. Set `0` to disable. | `120` |
| `NETLIFY_CDN_SWR` | `stale-while-revalidate` window for CDN (seconds). | `600` |
| `SCRAPER_UA_EXTRA` | Optional suffix appended to the default scraper UA. | – |

## Operations notes
- To relax limits quickly, raise `FETCH_URL_MAX_BYTES` (e.g., `8388608`) and set `NETLIFY_CDN_MAX_AGE=0`.
- SSRF protections are heuristic and avoid DNS resolution for speed.
- HEAD preflight skips oversized bodies when the server advertises `Content-Length`, but some origins misreport this header. The streamed GET still enforces the byte cap.
- The response body remains the proxied upstream bytes; callers do not need to change.
