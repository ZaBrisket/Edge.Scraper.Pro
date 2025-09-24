# EdgeScraperPro - Standalone HTML Version

A professional web scraper with sports data extraction capabilities, now running as a pure HTML + Netlify Functions application.

## 🚀 Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
# Using http-server
npm run serve

# Using Netlify Dev (recommended)
npm run dev
```

3. Open http://localhost:8080 (or http://localhost:8888 with Netlify Dev)

### Deployment

This app is configured for Netlify deployment:

```bash
git push origin main
```

Netlify will automatically:
- Serve the `public/` directory as static files
- Deploy serverless functions from `netlify/functions/`
- Apply environment variables from netlify.toml

## 📁 Project Structure

```
edge-scraper-pro/
├── public/                      # Static HTML application
│   ├── index.html              # Main application
│   ├── batch-processor.js      # Batch processing logic
│   ├── enhanced-url-validator.js # URL validation
│   ├── pfr-validator.js        # Sports-specific validation
│   └── sports-extractor.js     # Sports content extraction
├── netlify/
│   └── functions/              # Serverless functions
│       ├── fetch-url.js        # Main scraping endpoint
│       └── health.js           # Health check
├── src/                        # Shared libraries (for functions)
├── netlify.toml               # Netlify configuration
├── package.json               # Minimal dependencies
└── .env                       # Local environment variables
```

## 🔧 Environment Variables

Set these in Netlify Dashboard > Site settings > Environment variables:

```bash
BYPASS_AUTH=true
HTTP_DEADLINE_MS=15000
PUBLIC_API_KEY=public-2024
NODE_ENV=production
```

## 🎯 Features

- **URL Scraping**: Fetch and extract content from any public URL
- **Sports Mode**: Enhanced extraction for sports statistics sites
- **Batch Processing**: Process multiple URLs efficiently
- **Multiple Export Formats**: JSON, CSV, Excel
- **URL Validation**: Built-in validation for common patterns
- **Rate Limiting**: Respectful scraping with configurable limits

## 🧱 Brutalist UI System

The standalone HTML experience now shares a monochrome brutalist design system that is enforced across every tool.

- **Global CSS**: `/public/assets/css/brutalist.css` defines reusable tokens (`--color-ink`, spacing scale, breakpoints) and layout primitives used by all pages.
- **Configurable Limits**: `/public/config.js` exposes `window.APP_CONFIG` for maximum file size, concurrency caps, and default sports mode behaviour. Client-side scripts reference these values before any processing begins.
- **Reusable Components**: Navigation, error handling, and the file uploader live under `/public/components/`. Each component registers itself on `window.EdgeComponents`:
  - `renderNavigation(root, activeId)` injects the shared header and sets the active link.
  - `mountErrorHandler(el)`, `showError(el, message)`, and `clearError(el)` provide consistent error messaging.
  - `initializeFileUploader(options)` wires drag-and-drop zones with size/type validation based on `APP_CONFIG`.
- **Component Loader**: `/public/components/loader.js` auto-mounts navigation and error containers on `DOMContentLoaded`.

Run the lightweight bundler to emit a concatenated component bundle and minified CSS snapshot for deployments that prefer single-file assets:

```bash
node build.js
```

The script writes artefacts to `dist/components.bundle.js` and `dist/brutalist.css`.

## ♿ Accessibility & Progressive Enhancement

- Every page renders a consistent header with semantic navigation and `aria-current` markers.
- `<noscript>` fallbacks explain limitations when JavaScript is disabled.
- Error banners use live regions so assistive technologies announce failures immediately.
- Result tables remain accessible and cache their most recent payload in `localStorage` so users can revisit exports without re-running scrapes.

## 🛠️ API Endpoints

### Fetch URL
```
GET /.netlify/functions/fetch-url?url=https://example.com
Headers: X-API-Key: public-2024
```

### Health Check
```
GET /.netlify/functions/health
```

## 📝 License

MIT