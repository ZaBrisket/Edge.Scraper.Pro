# Contributing

When adding new Netlify Functions or other modules that perform outbound HTTP
requests, use the shared `fetchWithPolicy` helper located at
`src/lib/http/client.js`. This ensures requests respect timeouts, retries,
rate limits, and circuit breaker behaviour. Include the `x-correlation-id`
header from incoming events when making downstream requests.
