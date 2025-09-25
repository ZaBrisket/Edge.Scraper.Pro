# Configuring `ALLOWED_ORIGINS`

The Netlify functions in this project derive their CORS behaviour from the `ALLOWED_ORIGINS` environment variable. The value is a comma-separated list of origins that are permitted to access the endpoints.

```
ALLOWED_ORIGINS="https://edgescraperpro.com,https://*.netlify.app"
```

## Rules

- Origins are matched case-insensitively.
- `*` can be used as a wildcard within a token. For example `https://*.netlify.app` permits any Netlify preview subdomain, while `https://*.example.com` covers all subdomains of `example.com`.
- If `ALLOWED_ORIGINS` is not set, the functions default to `*` (allow all).
- When a request does not provide an `Origin` header, the first configured origin is returned as the fallback value.
- The helpers always append `Vary: Origin` so that CDN caches stay origin-aware.

## Recommendations

- Prefer explicit origins for production domains (e.g. `https://edgescraperpro.com`).
- Include preview domains if you rely on Netlify Deploy Previews.
- Avoid mixing protocols (stick to `https://` where possible) to prevent accidental downgrades.
