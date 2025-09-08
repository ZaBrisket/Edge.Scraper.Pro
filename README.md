# Edge.Scraper.Pro

## Bulk-Only Web Scraper
This project provides a simple bulk web scraper backed by Netlify Functions.
Paste a list of URLs into the UI and retrieve page text in one click. All
network requests happen server-side; no API keys are required.

## Usage
- **UI:** open the deployed site, paste one URL per line, and click **Scrape**.
- **Programmatic:** call `/.netlify/functions/fetch-url?url=<https URL>` to fetch
  the HTML of a page.

## Development
```bash
npm ci
npm test
```

## HTTP Reliability Policy
All Netlify functions delegate outbound HTTP requests to a shared client. The
client enforces timeouts, retries with jitter, per-host concurrency limits, and
adds an `x-correlation-id` for traceability. Configuration is driven by
environment variables validated via `zod`; see `.env.example` for defaults.
