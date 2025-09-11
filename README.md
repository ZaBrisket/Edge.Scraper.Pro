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

### 🔧 Robust URL Canonicalization

EdgeScraperPro automatically handles common URL issues that cause 404 errors through intelligent URL normalization:

#### Key Features
- **HTTP → HTTPS Upgrade**: Automatically retries failed HTTP requests with HTTPS
- **Domain Variants**: Tests both `www.` and apex domain versions (`example.com` ↔ `www.example.com`)
- **Trailing Slash Handling**: Tries both with and without trailing slashes
- **Redirect Chain Tracking**: Records the full redirect path for analysis
- **Caching**: Successful canonicalizations are cached to avoid repeated work

#### How It Works
When a URL returns a 404, the system automatically generates and tests variants in this order:
1. `https://example.com/path` (HTTPS upgrade)
2. `https://www.example.com/path` (HTTPS + www)
3. `https://example.com/path/` (HTTPS + trailing slash)
4. `https://www.example.com/path/` (HTTPS + www + trailing slash)
5. `https://example.com/path` (apex domain if original had www)

#### Example
```javascript
// Original failing URL
const url = 'http://www.d2pbuyersguide.com/filter/all/page/1';

// System automatically tries:
// ✓ https://www.d2pbuyersguide.com/filter/all/page/1 (SUCCESS!)
// Result: 404 → 200 with canonical URL
```

### 🔍 Intelligent Pagination Discovery

Automatically discovers and extracts additional pages from directory sites:

#### Discovery Modes
- **Auto Mode** (default): Tries range-based discovery first, falls back to letter indexes
- **Range Mode**: Discovers `/page/1`, `/page/2`, etc. by probing incrementally
- **Letters Mode**: Tests letter-indexed routes like `/filter/a/page/1`, `/filter/b/page/1`

#### Detection Methods
1. **HTML Analysis**: Parses `rel="next"` links and pagination controls
2. **Pattern Recognition**: Identifies common pagination selectors
3. **Smart Probing**: Tests page ranges until consecutive 404s
4. **Letter Indexing**: Tests alphabetic and numeric indexes (a-z, 0-9)

#### Example Discovery
```javascript
// Input: Single URL
'https://directory.com/filter/all/page/1'

// Discovers:
[
  'https://directory.com/filter/all/page/1',   // Original
  'https://directory.com/filter/all/page/2',   // Range discovery
  'https://directory.com/filter/all/page/3',
  // ... up to 50 pages
  'https://directory.com/filter/a/page/1',     // Letter fallback
  'https://directory.com/filter/b/page/1',
  // ... for valid letters
]
```

### 📊 Enhanced Error Taxonomy

Replaces generic `client_error:unknown` with specific, actionable error categories:

#### Specific Error Classes
- **`http_404`**: Standard 404 Not Found (with canonicalization attempts)
- **`http_403`**: Forbidden (may indicate rate limiting or blocking)
- **`http_401`**: Unauthorized access
- **`dns_error`**: Domain name resolution failed
- **`ssl_error`**: Certificate or TLS connection issues
- **`network_error`**: Connection refused, timeout, etc.
- **`blocked_by_robots`**: Disallowed by robots.txt
- **`anti_bot_challenge`**: Cloudflare or similar challenge detected
- **`redirect_loop`**: Circular redirect detected

#### Structured Error Data
Each error includes:
```json
{
  "error_class": "http_404",
  "original_url": "http://example.com/page/1",
  "resolved_url": "https://example.com/page/1", 
  "attempts": 4,
  "redirect_chain": [...],
  "response_time_ms": 1250
}
```

### 🧪 Testing & Validation

#### Run the D2P Buyers Guide Replay Test
Test the original failing URLs with the new normalization system:

```bash
# Quick test (10 URLs, conservative settings)
./run-d2p-replay.sh 1 10 0.5

# Full test (50 URLs, balanced settings) 
./run-d2p-replay.sh 2 50 1

# Aggressive test (all URLs, faster)
./run-d2p-replay.sh 3 50 2
```

#### Expected Results
- ✅ **Zero `unknown` errors** - All failures properly categorized
- ✅ **HTTP → HTTPS canonicalization** - Failed HTTP URLs upgraded to HTTPS
- ✅ **Structured NDJSON logs** - Machine-readable logs with full error context
- ✅ **Pagination discovery** - Additional valid pages discovered automatically

#### Unit Tests
```bash
# Run URL canonicalizer tests
npm test tests/url-canonicalizer.test.js

# Run D2P integration tests  
npm test tests/d2p-integration.test.js
```

### 📈 Configuration Options

Enable/disable features in your batch processor:

```javascript
const processor = new BatchProcessor({
  enableUrlNormalization: true,      // Auto-retry with canonical URLs
  enablePaginationDiscovery: true,   // Discover additional pages
  enableStructuredLogging: true,     // NDJSON logs with error taxonomy
  concurrency: 2,                    // Conservative concurrent requests
  timeout: 15000                     // 15s timeout per request
});
```

### 🎯 Use Cases

This system is particularly effective for:
- **Directory Sites**: Business directories, supplier catalogs, member listings
- **Paginated Content**: Any site with `/page/N` or letter-indexed navigation
- **Mixed Protocols**: Sites that serve both HTTP and HTTPS inconsistently  
- **Domain Migrations**: Sites transitioning between www/apex domains
- **Error Analysis**: Understanding and categorizing scraping failures

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
