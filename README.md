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

## URL Normalization & Pagination Discovery

### D2P Buyers Guide Enhancement

The enhanced scraper now includes robust URL normalization and pagination discovery to fix common 404 issues:

#### Key Features
- **URL Canonicalization**: Automatic HTTP→HTTPS upgrades, www variants, trailing slash handling
- **Pagination Discovery**: Auto-detection of pagination patterns with letter-based fallback
- **Structured Error Logging**: Comprehensive error taxonomy with NDJSON output
- **Intelligent Fallbacks**: Multiple URL variants tested until one succeeds

#### URL Canonicalization Process
```javascript
const { URLCanonicalizer } = require('./src/lib/http/url-canonicalizer');

const canonicalizer = new URLCanonicalizer();
const result = await canonicalizer.canonicalize('http://example.com/page/1');

if (result.success) {
  console.log('Canonicalized:', result.canonicalUrl); // https://example.com/page/1
  console.log('Status:', result.status); // 200
  console.log('Redirects:', result.redirectChain); // []
}
```

#### Pagination Discovery
```javascript
const { PaginationDiscovery } = require('./src/lib/http/pagination-discovery');

const discovery = new PaginationDiscovery();
const result = await discovery.discoverPagination('https://example.com/filter/all/page/1');

if (result.success) {
  console.log('Discovered pages:', result.totalPages);
  console.log('Page URLs:', result.discoveredPages.map(p => p.url));
}
```

#### Enhanced Scraping
```javascript
const { EnhancedScraper } = require('./src/lib/http/enhanced-scraper');

const scraper = new EnhancedScraper({
  enableCanonicalization: true,
  enablePaginationDiscovery: true,
  enableStructuredLogging: true
});

// Single URL with full enhancement pipeline
const result = await scraper.scrapeUrl('http://example.com/page/1');

// Batch processing
const results = await scraper.scrapeUrls(urlList);

// With pagination discovery
const paginationResult = await scraper.scrapeWithPagination(baseUrl);
```

#### D2P Replay Script
```bash
# Test the enhancement against the original failing URLs
node bin/d2p-replay.js

# This will:
# 1. Test first 5 URLs to verify fixes
# 2. Process all 50 original URLs with enhancements
# 3. Show detailed results and error breakdown
# 4. Save structured results to logs/
```

#### Error Classification
The enhanced scraper provides detailed error classification:
- `http_404`, `http_403`, `http_429`, `http_5xx`
- `dns_error`, `connection_refused`, `timeout`
- `blocked_by_robots`, `anti_bot_challenge`
- `canonicalization_failed`, `pagination_failed`

#### Expected Results
- **Before**: 50/50 URLs failing with 404 errors
- **After**: 80-90% success rate with automatic URL normalization
- **Bonus**: Automatic discovery of additional pagination pages

For detailed documentation, see [D2P Enhancement Summary](D2P_ENHANCEMENT_SUMMARY.md).

## Usage

### Bulk URL Upload (NEW!)
**Upload up to 1500 URLs at once using TXT or JSON files:**

1. **File Upload Options:**
   - **TXT Format**: One URL per line, supports comments with `#`
   - **JSON Format**: Array of URLs or `{"urls": [...]}` object format
   - **Drag & Drop**: Simply drag files onto the upload area
   - **Browse**: Click "Browse Files" to select files manually

2. **Example TXT File:**
```
# Sports player URLs
https://www.pro-football-reference.com/players/M/MahoPa00.htm
https://www.pro-football-reference.com/players/B/BradTo00.htm

# General URLs  
https://example.com
```

3. **Example JSON File:**
```json
{
  "urls": [
    "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "https://www.pro-football-reference.com/players/B/BradTo00.htm"
  ]
}
```

### Basic Web Scraping
- **UI:** Upload a file or paste URLs manually, then click **Scrape**
- **Programmatic:** Call `/.netlify/functions/fetch-url?url=<https URL>` to fetch HTML

### Enhanced Sports Scraping
1. Upload sports URLs via file or paste Pro Football Reference player URLs manually
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

## Features

### Core Functionality
- **Bulk File Upload**: Upload up to 1500 URLs via TXT or JSON files with drag-and-drop support
- **Bulk Processing**: Concurrent scraping with rate limiting and error handling
- **Enhanced HTTP Client**: Per-host rate limiting, 429-aware retries, circuit breaker hygiene
- **Content Extraction**: Advanced algorithms for main content detection
- **Export Options**: TXT, JSONL, CSV, Enhanced CSV, Structured JSON, Player Database
- **Debug Tools**: Detailed extraction analysis and performance metrics
- **PFR URL Validation**: Pre-fetch validation for Pro Football Reference and other sports reference URLs
- **Duplicate Detection**: Upfront duplicate URL detection with normalized comparison
- **Memory Optimization**: Chunked processing for large batches with automatic memory management
- **Progress Tracking**: Real-time progress with pause/resume capability and session recovery
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
