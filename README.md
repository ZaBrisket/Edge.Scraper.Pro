# EdgeScraperPro — Static Tools Hub

EdgeScraperPro is a static HTML application backed by Netlify Functions. The production bundle now ships a **Tools Hub** homepage that links out to the individual experiences (Scrape, Sports, Companies, Targets, NDA) rendered inside brutalist wrappers. All Netlify Function contracts remain unchanged.

## 🚀 Quick Start

```bash
# Install dependencies
npm ci

# Serve the static UI (http://localhost:8888)
npx http-server public -p 8888 --silent

# Or run the full stack (functions + UI)
netlify dev
```

When using `http-server`, the Playwright configuration automatically boots the server for tests. Use `netlify dev` when you need live serverless functions.

## 🧭 Navigation Map

The shared header exposes consistent routes:

| Path            | Description                                   |
|-----------------|-----------------------------------------------|
| `/`             | Tools Hub cards linking to every experience   |
| `/scrape/`      | General scraper (iframe embedding `app.html`) |
| `/sports/`      | Scraper wrapper with Sports preset heuristics |
| `/companies/`   | Scraper wrapper with Companies preset         |
| `/targets/`     | Targets processor iframe                      |
| `/nda/`         | NDA Reviewer v2 iframe                        |

Each wrapper uses `/css/brutalist.css` and `/js/nav.js` to keep typography, spacing, focus states, and active navigation in sync.

## 🔐 Content Security Policy

All brutalist wrappers and the NDA app ship with an aligned CSP that blocks inline JavaScript while still permitting the legacy inline styles required by the archived experiences:

```
default-src 'self' data: blob: https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.netlify.app https://*.netlify.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://edgescraperpro.com https://www.edgescraperpro.com http://localhost:3000 http://127.0.0.1:8080;
```

Scripts are now externalised (`/js/iframe-loader.js`, `/nda/js/frame-guard.js`, `/nda/js/nda-bootstrap.js`) so the CSP no longer relies on `'unsafe-inline'` for execution.

## 🪟 Frame Allowlist Configuration

`public/nda/app.html` enforces its own frame ancestry before booting the reviewer UI. The `<body>` tag exposes the allowlist via `data-allowed-origins`. Update this comma-separated list if you need to embed the reviewer from an additional host. The runtime guard automatically appends the current origin, so same-origin iframes (e.g. local `http-server` on port 8080) continue to function without extra configuration.

When a request comes from a non-approved parent, the guard renders an inline warning, sets `data-frame-blocked="true"` on `<html>`, and dispatches `window.sendTelemetry('iframe_blocked', { origin })` if telemetry is available.

## 🧾 Nonce build tool

The repository includes `tools/build-nonces.js` to future-proof any inline script requirements. Mark inline blocks with `data-nonce` and run:

```bash
npm run build:nonces
```

The tool injects a per-file nonce into the CSP `script-src` directive and swaps `data-nonce` with a real `nonce="…"` attribute. CI (GitHub Actions + Husky pre-commit) executes `npm run test:contamination`, so the contamination scan must pass before code is committed.

## 📁 Project Structure

```
Edge.Scraper.Pro/
├── public/
│   ├── index.html            # Tools Hub landing page
│   ├── scrape/
│   │   ├── index.html        # Wrapper with iframe
│   │   └── app.html          # Legacy scraper SPA
│   ├── sports/index.html     # Sports preset wrapper
│   ├── companies/index.html  # Companies preset wrapper
│   ├── targets/
│   │   ├── index.html        # Wrapper shell
│   │   └── app.html          # Original targets UI
│   └── nda/
│       ├── index.html        # Wrapper shell
│       └── app.html          # NDA Reviewer 2.0
├── netlify/functions/        # Serverless functions (fetch-url, ma-news-scraper, …)
├── src/                      # Shared libraries used by functions
├── tests/                    # Playwright E2E + Jest unit tests
└── netlify.toml              # Redirects and function config
```

## 🧪 Testing

### Unit tests
```bash
npm test
```
This runs Jest against `src/` plus the custom specs under `tests/`, including the new `tests/unit/ma-news-scraper.spec.js` coverage.

### End-to-end tests
```bash
# Starts http-server automatically via playwright.config.ts
npm run e2e

# Or run the interactive UI mode
npm run e2e:ui
```
Playwright stubs critical Netlify endpoints (e.g. `/.netlify/functions/fetch-url`) so the UI flows exercise without making live network calls.

### Function smoke (optional)
```bash
netlify dev
curl -XPOST http://localhost:8888/.netlify/functions/ma-news-scraper -H 'Content-Type: application/json' -d '{"urls":["https://example.com"]}'
```

## 🛠️ Serverless Functions

The primary endpoints remain:

- `/.netlify/functions/fetch-url`
- `/.netlify/functions/ma-news-scraper`
- `/.netlify/functions/nda-parse-docx`
- `/.netlify/functions/nda-export-docx`
- `/.netlify/functions/nda-telemetry`
- `/.netlify/functions/health`

All responses preserve their historical shapes; recent work tightened HTTP safeguards (timeouts, byte caps, hostname denylist) inside `ma-news-scraper` without changing the request format.

## 🧾 Notes

- Skip links remain the first interactive element on every page to support keyboard navigation.
- Wrappers persist the preferred scraper mode using `localStorage` and `postMessage` so the embedded app restores the last preset.
- Tests stub out expensive fetches; when introducing new functions, add equivalent stubs before enabling the flow in E2E suites.

## 📝 License

MIT
