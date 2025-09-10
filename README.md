# Edge.Scraper.Pro

## Enhanced Sports Statistics Scraper
This project provides a comprehensive web scraping solution with specialized capabilities for sports statistics extraction. Built on Netlify Functions with advanced content detection, structured data parsing, and multiple export formats.

### 🏈 Sports-Specific Features
- **Intelligent Sports Detection**: Automatically recognizes Pro Football Reference and similar sports sites
- **Structured Data Extraction**: Player biography, statistics tables, achievements, and career data
- **Advanced Export Formats**: Enhanced CSV, structured JSON, player database, and Excel-compatible formats
- **Quality Validation**: 6-point sports content validation system with debug tools
- **Performance Optimized**: Handles 100+ player pages with detailed extraction analysis

## Usage

### Basic Web Scraping
- **UI:** Open the deployed site, paste one URL per line, and click **Scrape**
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

## Features

### Core Functionality
- **Bulk Processing**: Concurrent scraping with rate limiting and error handling
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

## HTTP Resilience & Rate Limiting

### Overview
The system uses a comprehensive HTTP client with per-host rate limiting, intelligent 429 handling, and circuit breaker protection. This prevents overwhelming upstream servers while ensuring reliable data extraction.

### Key Features
- **Per-Host Rate Limiting**: Token bucket algorithm with configurable RPS and burst limits
- **429-Aware Retries**: Proper handling of rate limits with Retry-After header support
- **Circuit Breaker Hygiene**: Only genuine failures (5xx/network) trigger circuit opens, not rate limits
- **Exponential Backoff**: Full jitter backoff with configurable delays and caps
- **Comprehensive Observability**: Structured metrics for rate limits, retries, and circuit states

### Configuration

#### Environment Variables

```bash
# HTTP timeouts and retries
HTTP_DEADLINE_MS=10000                    # Request timeout (default: 10s)
HTTP_MAX_RETRIES=3                        # Maximum retry attempts (default: 3)
HTTP_MAX_CONCURRENCY=2                    # Concurrent requests per host (default: 2)

# Circuit breaker settings
HTTP_CIRCUIT_BREAKER_THRESHOLD=10         # Failures to trigger open (default: 10)
HTTP_CIRCUIT_BREAKER_RESET_MS=60000       # Reset timeout (default: 60s)
HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS=3 # Half-open test calls (default: 3)

# Retry backoff configuration
HTTP_RETRY_BASE_DELAY_MS=1000             # Base delay for exponential backoff (default: 1s)
HTTP_RETRY_MAX_DELAY_MS=30000             # Maximum backoff delay (default: 30s)
HTTP_RETRY_JITTER_MAX_MS=1000             # Additional random jitter (default: 1s)

# Default rate limits for all hosts
HOST_LIMIT__DEFAULT__RPS=2.0              # Default requests per second (default: 2.0)
HOST_LIMIT__DEFAULT__BURST=5              # Default burst capacity (default: 5)

# Pro-Football-Reference specific limits (conservative)
HOST_LIMIT__www.pro-football-reference.com__RPS=0.8    # 0.8 RPS (default: 0.8)
HOST_LIMIT__www.pro-football-reference.com__BURST=2    # Burst of 2 (default: 2)

# Custom host limits (example)
HOST_LIMIT__api.example.com__RPS=5.0      # 5 RPS for api.example.com
HOST_LIMIT__api.example.com__BURST=10     # Burst of 10
```

#### Rate Limiting Best Practices

**Pro-Football-Reference (PFR) Tuning:**
- Default: 0.8 RPS with burst of 2 (conservative, production-safe)
- Aggressive: 1.5 RPS with burst of 3 (higher throughput, monitor for 429s)
- Conservative: 0.5 RPS with burst of 1 (safest for large batches)

**General Sports Sites:**
- Start with 2.0 RPS and adjust based on 429 frequency
- Monitor rate limit dashboard for optimal tuning
- Increase burst capacity for bursty workloads

### Monitoring & Observability

#### Rate Limiting Dashboard
```bash
# View real-time rate limiting statistics
node tools/http-stats.js dashboard

# Show all HTTP metrics
node tools/http-stats.js all

# Monitor circuit breaker status
node tools/http-stats.js circuits
```

#### Key Metrics to Watch

**Rate Limiting:**
- `rate_limit.hit` - Pre-request rate limiting triggers
- `429.deferred` - Upstream 429s properly handled as deferrals
- `retry.scheduled` - Retry attempts with backoff

**Circuit Breaker:**
- `circuit.open/half_open/closed` - State transitions
- Only 5xx and network errors should trigger opens, never 429s

**Request Success:**
- No "[500] Upstream 429" errors in logs
- Circuit breakers remain closed during 429 bursts
- Batch completion with 0 fatal 500s from rate limiting

#### Log Analysis
```bash
# Analyze error patterns
node tools/analyze_errors.js path/to/error.log

# Monitor structured logs for rate limiting events
grep "rate_limit.hit\|429.deferred\|retry.scheduled" logs/app.log
```

### Troubleshooting

#### High 429 Rate
**Symptoms:** Many `429.deferred` events, slow batch completion
**Solutions:**
1. Reduce RPS: `HOST_LIMIT__<host>__RPS=0.5`
2. Increase retry delays: `HTTP_RETRY_BASE_DELAY_MS=2000`
3. Check if Retry-After headers are being honored

#### Circuit Breaker Opens
**Symptoms:** `circuit.open` events, `CircuitOpenError` in logs
**Investigation:**
1. Verify 429s are NOT counting as failures
2. Check for genuine 5xx or network errors
3. Consider increasing threshold: `HTTP_CIRCUIT_BREAKER_THRESHOLD=15`

#### Slow Batch Processing
**Symptoms:** Long completion times, high wait times
**Tuning:**
1. Increase burst capacity for bursty workloads
2. Optimize retry delays for your traffic pattern
3. Monitor rate limit token availability

### Error Handling Changes

#### Before (Problematic)
```javascript
// ❌ Old behavior - 429s mapped to 500s
if (response.status === 429) {
  throw new Error('[500] Upstream 429'); // Wrong!
}
```

#### After (Correct)
```javascript
// ✅ New behavior - 429s are deferrals, not failures
if (response.status === 429) {
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  throw new RateLimitError('Upstream rate limited', { 
    status: 429,
    retryAfter: retryAfter 
  }); // Triggers intelligent retry, not circuit failure
}
```

### Testing Resilience

Run the comprehensive test suite to validate resilient HTTP handling:

```bash
# Unit and integration tests
npm test tests/http-resilience.test.js

# End-to-end PFR batch test (requires network)
node tests/pfr-batch-integration.js
```

**Acceptance Criteria:**
- ✅ Batch of 100+ PFR URLs completes with 0 fatal 500s from 429s
- ✅ Circuit breakers remain closed during 429 bursts  
- ✅ Rate limiting prevents overwhelming upstream servers
- ✅ Retry-After headers are properly honored
- ✅ Exponential backoff with jitter smooths retry spikes

### Performance Metrics
- **Extraction Speed**: < 100ms per sports page
- **Content Accuracy**: ≥ 85% for player information  
- **Structured Data Quality**: ≥ 70% completeness
- **Test Suite**: 80%+ pass rate for production readiness
- **Rate Limit Compliance**: 0 fatal 500s from upstream 429s
- **Circuit Breaker Health**: Closed state during normal 429 activity
