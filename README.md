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

### M&A Target List Builder

Transform SourceScrub CSV exports into curated acquisition target lists:

1. Navigate to `/targets` or click "Target Lists" in the navigation
2. Upload a SourceScrub CSV export (handles 2-line header automatically) or v2 XLSX workbook
3. View curated "Target Universe" with:
   - Company logos from Clearbit
   - Derived fields (domain, revenue in $MM, executive block)
   - Interactive filters (State, Industry, End Market)
   - Column sorting and search
4. Export to CSV or Excel (includes IMAGE() formula for logos)

Features:
- **Privacy-first**: All processing happens client-side, emails excluded from exports by default
- **Data persistence**: Last session saved to localStorage
- **Smart parsing**: Handles SourceScrub format quirks (tab characters, 2-line header)
- **Excel compatibility**: Exports include Excel 365 IMAGE() formulas for logos

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