# Edge.Scraper.Pro

## Enhanced Sports Statistics Scraper
This project provides a comprehensive web scraping solution with specialized capabilities for sports statistics extraction. Built on Netlify Functions with advanced content detection, structured data parsing, and multiple export formats.

### 🏈 Sports-Specific Features
- **Intelligent Sports Detection**: Automatically recognizes Pro Football Reference and similar sports sites
- **Structured Data Extraction**: Player biography, statistics tables, achievements, and career data
- **Advanced Export Formats**: Enhanced CSV, structured JSON, player database, and Excel-compatible formats
- **Quality Validation**: 6-point sports content validation system with debug tools
- **Performance Optimized**: Handles 100+ player pages with detailed extraction analysis

## Enhanced HTTP Client

### 429 Rate Limiting Solution

The enhanced HTTP client (`src/lib/http/simple-enhanced-client.js`) solves critical issues with handling HTTP 429 (Too Many Requests) responses:

#### Key Features
- **Per-host rate limiting** using token bucket algorithm
- **429-aware retry logic** with exponential backoff and jitter
- **Retry-After header support** for precise timing
- **Circuit breaker hygiene** that excludes 429s from failure counts
- **Comprehensive metrics** for observability

#### Configuration
```bash
# PFR-specific rate limiting (conservative)
HOST_LIMIT__www_pro_football_reference_com__RPS=0.5
HOST_LIMIT__www_pro_football_reference_com__BURST=1

# Retry configuration
HTTP_MAX_RETRIES=3
HTTP_BASE_BACKOFF_MS=2000
HTTP_MAX_BACKOFF_MS=30000

# Circuit breaker (excludes 429s)
HTTP_CIRCUIT_BREAKER_THRESHOLD=5
HTTP_CIRCUIT_BREAKER_RESET_MS=30000
```

#### Usage
```javascript
const { fetchWithPolicy, getMetrics } = require('./src/lib/http/simple-enhanced-client');

// Automatic rate limiting and retry
const response = await fetchWithPolicy('https://www.pro-football-reference.com/players/A/AllenJo00.htm');

// Monitor metrics
const metrics = getMetrics();
console.log('Rate limit hits:', metrics.rateLimits.hits);
```

#### Error Handling
```javascript
try {
  const response = await fetchWithPolicy(url);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Rate limited (non-fatal, will retry)
    console.log('Rate limited, will retry later');
  } else if (error instanceof NetworkError) {
    // Network/server error (fatal)
    console.error('Network error:', error.message);
  }
}
```

For detailed documentation, see [HTTP Client Enhancements](docs/HTTP_CLIENT_ENHANCEMENTS.md).

## Usage

### Basic Web Scraping
- **UI:** Open the deployed site, paste one URL per line, and click **Scrape**
- **File Upload:** Drag and drop or browse to upload .txt or .json files containing URLs (up to 1,500 URLs)
- **Programmatic:** Call `/.netlify/functions/fetch-url?url=<https URL>` to fetch HTML

### Enhanced Sports Scraping
1. Paste Pro Football Reference player URLs (one per line)
2. Enable "Debug Mode" for detailed extraction analysis
3. Use "Sports URLs Only" filter for focused results
4. Export with specialized formats:
   - **Enhanced CSV**: Sports-specific columns with player data
   - **Structured JSON**: Normalized player objects with metadata
   - **Player DB**: Relational database structure for analysis

### Example Sports URLs
```
https://www.pro-football-reference.com/players/M/MahoPa00.htm
https://www.pro-football-reference.com/players/B/BradTo00.htm
https://www.pro-football-reference.com/players/R/RiceJe00.htm
```

### File Upload Feature
The scraper now supports uploading files containing URLs for bulk processing:

#### Supported File Formats

**TXT Files** (`.txt`)
- One URL per line
- Comments supported (lines starting with `#`)
- Empty lines are ignored
- Example:
  ```
  https://example.com/page1
  https://example.com/page2
  # This is a comment
  https://example.com/page3
  ```

**JSON Files** (`.json`)
- Simple array format:
  ```json
  ["url1", "url2", "url3"]
  ```
- Object array format:
  ```json
  [
    {"url": "url1", "name": "Page 1"},
    {"url": "url2", "name": "Page 2"}
  ]
  ```
- Nested format:
  ```json
  {
    "urls": ["url1", "url2", "url3"]
  }
  ```

#### Upload Limits
- Maximum file size: 5MB
- Maximum URLs per file: 1,500
- Drag and drop supported
- Option to merge with manually entered URLs

## Features

### Core Functionality
- **Bulk Processing**: Concurrent scraping with rate limiting and error handling
- **File Upload Support**: Upload .txt or .json files containing up to 1,500 URLs
- **Enhanced HTTP Client**: Per-host rate limiting, 429-aware retries, circuit breaker hygiene
- **Content Extraction**: Advanced algorithms for main content detection
- **Export Options**: TXT, JSONL, CSV, Enhanced CSV, Structured JSON, Player Database
- **Debug Tools**: Detailed extraction analysis and performance metrics
- **PFR URL Validation**: Pre-fetch validation for Pro Football Reference and other sports reference URLs
- **Duplicate Detection**: Upfront duplicate URL detection with normalized comparison
- **Unified Timeouts**: Environment-driven HTTP timeout configuration (HTTP_DEADLINE_MS)

### Sports Enhancement
- **Player Biography Parsing**: Name, position, physical stats, college, draft info
- **Statistical Tables**: Season-by-season stats, career totals, playoff performance
- **Achievement Recognition**: Awards, honors, records, career milestones
- **Quality Validation**: Sports-specific content validation and scoring

## Development

### Setup
```bash
npm ci
npm test
npm run build
```

### Testing Sports Features
```bash
# Run comprehensive sports scraper test suite
node test-sports-scraper.js

# View detailed test results
cat test-results-YYYY-MM-DD.json
```

### Architecture
- **Frontend**: Single-file HTML application with enhanced sports extraction
- **Backend**: Netlify Functions with HTTP reliability policies
- **Sports Engine**: Modular extraction system with site-specific configurations
- **Export System**: Multiple format support with structured data preservation

## Trivia Exporter

The trivia exporter transforms raw Pro Football Reference player data into a normalized dataset for NFL trivia applications.

### Usage

```bash
# Build the TypeScript files
npm run build

# Export trivia dataset (basic usage)
node bin/edge-scraper export

# Export with custom options
node bin/edge-scraper export \
  --input fixtures/raw/sports_structured_data.json \
  --out build/dataset.trivia_v1.json \
  --season-min 1997 --season-max 2024 \
  --positions QB,RB,WR,TE \
  --require-G-min 1 \
  --drop-summary-rows \
  --pretty \
  --verbose
```

### Options

- `--mode`: Export mode (currently only `trivia_v1`)
- `--input`: Path to input JSON file (default: `fixtures/raw/sports_structured_data.json`)
- `--out`: Output file path (default: `build/dataset.trivia_v1.json`)
- `--season-min`: Minimum season year (default: 1997)
- `--season-max`: Maximum season year (default: 2024)
- `--positions`: Comma-separated list of positions to include (default: QB,RB,WR,TE)
- `--require-G-min`: Minimum games played to include season (default: 1)
- `--drop-summary-rows`: Drop summary/aggregate rows (default: true)
- `--pretty`: Pretty-print JSON output
- `--strict`: Strict mode - fail on any error
- `--verbose`: Verbose output
- `--no-validate`: Skip schema validation

### Output Format

The exporter produces a JSON file with the following structure:

```json
{
  "schema": { "name": "trivia_v1", "version": "1.0.0" },
  "players": [
    {
      "player_id": "drew_brees",
      "full_name": "Drew Brees", 
      "pos": "QB",
      "college": "Purdue",
      "birthdate": "1979-01-15",
      "fun_fact": null
    }
  ],
  "qb_seasons": [...],
  "rb_seasons": [...],
  "wr_seasons": [...], 
  "te_seasons": [...],
  "eligibility": [...],
  "daily_picks": {},
  "generated_at": "2025-09-09T22:00:00.000Z"
}
```

### Features

- **Historical team mapping**: Correctly maps team codes across relocations (e.g., SDG → LAC, STL → LAR)
- **Data normalization**: Handles PFR formatting quirks, coerces numeric values, parses awards
- **Multi-team seasons**: Properly handles players who played for multiple teams in one season
- **Summary row filtering**: Removes aggregate rows like "Career", "17 Game Avg", etc.
- **Schema validation**: Built-in JSON schema validation with comprehensive error reporting
- **Position-specific stats**: Separates QB, RB, WR, and TE statistics into dedicated arrays

## Documentation
- **[Sports Scraper Guide](docs/SPORTS_SCRAPER.md)**: Comprehensive documentation for sports features
- **[Operations Manual](docs/OPERATIONS.md)**: Deployment and configuration details
- **[Contributing Guide](CONTRIBUTING.md)**: Development standards and guidelines

## HTTP Reliability Policy
All Netlify functions delegate outbound HTTP requests to a shared client. The
client enforces timeouts, retries with jitter, per-host concurrency limits, and
adds an `x-correlation-id` for traceability. Configuration is driven by
environment variables validated via `zod`; see `.env.example` for defaults.

## Performance Metrics
- **Extraction Speed**: < 100ms per sports page
- **Content Accuracy**: ≥ 85% for player information
- **Structured Data Quality**: ≥ 70% completeness
- **Test Suite**: 80%+ pass rate for production readiness
