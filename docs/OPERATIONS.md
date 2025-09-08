# Operations

The resilient HTTP client can be tuned using environment variables. Values are
validated at startup and defaults are provided:

- `HTTP_DEADLINE_MS` – per-request timeout in milliseconds.
- `HTTP_MAX_RETRIES` – number of retry attempts on transient failures.
- `HTTP_RATE_LIMIT_PER_SEC` – token bucket refill rate per host.
- `HTTP_MAX_CONCURRENCY` – maximum concurrent requests per host.
- `HTTP_CIRCUIT_BREAKER_THRESHOLD` – consecutive failures before a circuit opens.
- `HTTP_CIRCUIT_BREAKER_RESET_MS` – time before a half-open probe is allowed.

Logs include an `x-correlation-id` field to correlate requests across systems.
