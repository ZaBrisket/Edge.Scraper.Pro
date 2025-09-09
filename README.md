# Edge.Scraper.Pro

## Bulk-Only Web Scraper
This project provides a simple bulk web scraper backed by Netlify Functions.
Paste a list of URLs into the UI and retrieve page text in one click. All
network requests happen server-side; no API keys are required.

## Usage
- **UI:** open the deployed site, paste one URL per line, and click **Scrape**.
- **Programmatic:** call `/.netlify/functions/fetch-url?url=<https URL>` to fetch
  the HTML of a page.

## Development
```bash
npm ci
npm test
npm run build
```

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

## HTTP Reliability Policy
All Netlify functions delegate outbound HTTP requests to a shared client. The
client enforces timeouts, retries with jitter, per-host concurrency limits, and
adds an `x-correlation-id` for traceability. Configuration is driven by
environment variables validated via `zod`; see `.env.example` for defaults.
