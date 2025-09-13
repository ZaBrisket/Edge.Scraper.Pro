# M&A News Scraper - Complete Diff

## Summary of Changes

This document shows all the changes needed to implement the M&A News Scraper feature.

## New Files to Add

### 1. `src/lib/extractors/ma-extractor.js` (NEW FILE)
```javascript
const natural = require('natural');
const compromise = require('compromise');
const { parse } = require('date-fns');

class MAExtractor {
  constructor() {
    this.dealValuePatterns = [
      /\$[\d,]+\.?\d*\s*(billion|million|M|B)/gi,
      /USD\s*[\d,]+\.?\d*\s*(billion|million)/gi,
      /valued at\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /consideration of\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /price of\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /for\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi
    ];
    // ... (full file content as implemented)
  }
  // ... rest of the class implementation
}

module.exports = MAExtractor;
```

### 2. `src/lib/discovery/ma-url-finder.js` (NEW FILE)
```javascript
const axios = require('axios');
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');

class MAUrlFinder {
  constructor() {
    this.maKeywords = [
      'merger', 'acquisition', 'acquire', 'acquires', 'acquired',
      'buyout', 'takeover', 'deal', 'transaction', 'purchase',
      'divestiture', 'divest', 'joint venture', 'strategic partnership'
    ];
    // ... (full file content as implemented)
  }
  // ... rest of the class implementation
}

module.exports = MAUrlFinder;
```

### 3. `src/config/news-sources.js` (NEW FILE)
```javascript
module.exports = {
  sources: {
    'businesswire': {
      baseUrl: 'https://www.businesswire.com',
      searchUrl: 'https://www.businesswire.com/portal/site/home/search/',
      selectors: {
        title: 'h1.bw-release-title, h1[itemprop="headline"], .headline',
        date: 'time.bw-release-date, time[datetime], .release-date',
        body: 'div.bw-release-body, article[itemprop="articleBody"], .release-body',
        company: 'span.bw-release-company, .company-name',
        contact: 'div.bw-contact, .contact-info'
      },
      rateLimit: { rps: 2, burst: 5, retryAfter: 5000 }
    },
    // ... (other sources as implemented)
  }
};
```

### 4. `netlify/functions/scrape-ma-news.js` (NEW FILE)
```javascript
const axios = require('axios');
const cheerio = require('cheerio');
const PQueue = require('p-queue').default;
const MAExtractor = require('../../src/lib/extractors/ma-extractor');
const MAUrlFinder = require('../../src/lib/discovery/ma-url-finder');
const newsSources = require('../../src/config/news-sources');

// ... (full implementation as created)

exports.handler = async (event, context) => {
  // ... (handler implementation)
};
```

### 5. `scripts/build-ma.js` (NEW FILE)
```javascript
const fs = require('fs');
const path = require('path');

console.log('Building M&A Scraper...');

// Ensure directories exist
const dirs = [
  'dist',
  'netlify/functions',
  'src/lib/extractors',
  'src/lib/discovery',
  'src/config'
];

dirs.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Copy index.html to dist
const indexPath = path.join(process.cwd(), 'public', 'index.html');
const distIndexPath = path.join(process.cwd(), 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, distIndexPath);
  console.log('Copied index.html to dist/');
}

console.log('Build complete!');
```

### 6. `tests/ma-scraping.test.js` (NEW FILE)
```javascript
const MAExtractor = require('../src/lib/extractors/ma-extractor');
const MAUrlFinder = require('../src/lib/discovery/ma-url-finder');

console.log('Running M&A Scraping Tests...\n');
// ... (full test implementation)
```

### 7. `.env` (NEW FILE)
```env
# M&A Scraping Configuration
MA_SCRAPING_ENABLED=true
MA_SOURCES=businesswire,prnewswire,globenewswire
MA_RATE_LIMIT_MULTIPLIER=0.5
MA_EXTRACTION_TIMEOUT=30000
MA_PARALLEL_REQUESTS=3
MA_MAX_URLS_PER_REQUEST=100

# HTTP Configuration
HTTP_TIMEOUT=15000
HTTP_MAX_RETRIES=3
HTTP_BASE_BACKOFF_MS=2000
HTTP_MAX_BACKOFF_MS=30000

# Node Configuration
NODE_ENV=production
```

## Files to Modify

### 1. `public/index.html`
Add before closing `</body>` tag:
```html
    <!-- Include necessary standalone JavaScript files -->
    <script src="sports-extractor.js"></script>

+   <!-- M&A Configuration Panel -->
+   <style>
+     .ma-config-panel {
+       background: #f5f5f5;
+       border: 1px solid #ddd;
+       border-radius: 8px;
+       padding: 20px;
+       margin: 20px 0;
+     }
+     /* ... (all styles as implemented) ... */
+   </style>
+
+   <div class="container">
+     <div class="ma-config-panel" id="maConfigPanel">
+       <h3>🏢 M&A News Scraping Configuration</h3>
+       <!-- ... (full HTML as implemented) ... -->
+     </div>
+   </div>
+
+   <!-- M&A Scraping JavaScript -->
+   <script>
+   document.addEventListener('DOMContentLoaded', function() {
+     // ... (full JavaScript implementation) ...
+   });
+   </script>
</body>
</html>
```

### 2. `package.json`
```diff
  "scripts": {
    "test": "jest",
-   "build": "npm run build:functions",
+   "build": "npm run build:ma",
+   "build:ma": "node scripts/build-ma.js",
    "build:functions": "cd netlify/functions && npm run build || echo 'No function build needed'",
+   "test:ma": "node tests/ma-scraping.test.js",
-   "serve": "npx http-server public -p 8080",
+   "serve": "netlify dev",
    "dev": "netlify dev",
    "clean": "rm -rf node_modules build dist",
    "lint": "eslint src --ext .js",
    "validate": "node src/lib/validators/pfr-validator.js"
  },
```

### 3. `netlify.toml`
```diff
[build]
  command = "npm run build"
  functions = "netlify/functions"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"
  
[functions]
  node_bundler = "esbuild"
+ external_node_modules = ["natural", "compromise", "jsdom"]
+ included_files = [
+   "src/**/*.js",
+   "src/**/*.json"
+ ]

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"

[[headers]]
  for = "/.netlify/functions/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Headers = "Content-Type"
    Access-Control-Allow-Methods = "GET, POST, OPTIONS"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[dev]
  command = "npm run serve"
  port = 8888
  targetPort = 3000
  autoLaunch = true
```

## Dependencies to Install

Run this command to install new dependencies:
```bash
npm install natural compromise xml2js
```

These are already in your package.json, but make sure they're installed.

## Directory Structure

Ensure these directories exist:
```
/workspace/
├── src/
│   ├── lib/
│   │   ├── extractors/
│   │   │   └── ma-extractor.js
│   │   └── discovery/
│   │       └── ma-url-finder.js
│   └── config/
│       └── news-sources.js
├── netlify/
│   └── functions/
│       └── scrape-ma-news.js
├── scripts/
│   └── build-ma.js
├── tests/
│   └── ma-scraping.test.js
└── public/
    └── index.html (modified)
```

## Testing

After implementing all changes:
```bash
# Install dependencies
npm install

# Run tests
npm run test:ma

# Build project
npm run build

# Test locally
npm run dev
```

## Deployment

```bash
# Deploy to Netlify
netlify deploy --prod
```