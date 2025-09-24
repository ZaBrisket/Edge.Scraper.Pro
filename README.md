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
