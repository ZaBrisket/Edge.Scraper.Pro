# Edge.Scraper.Pro

## HTTP Reliability Policy
All Netlify functions now delegate outbound HTTP requests to a shared client.
The client enforces per-request deadlines, automatic retries with exponential
backoff and jitter, per-host concurrency and rate limits, and a simple circuit
breaker. Each request carries an `x-correlation-id` for traceability and
structured logs are emitted via Pino.

Configuration is driven by environment variables validated via `zod`. See
`.env.example` for defaults.
