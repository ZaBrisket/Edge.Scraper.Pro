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
