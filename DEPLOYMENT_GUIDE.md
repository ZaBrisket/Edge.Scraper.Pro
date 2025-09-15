# Universal M&A News Scraper Deployment Guide

## Overview
This enhanced scraper system handles all major M&A news outlets and PR wire services with robust anti-bot protection, including:
- PR Newswire, Business Wire, CB Insights
- Reuters, Bloomberg, WSJ
- MarketWatch, Seeking Alpha, Yahoo Finance
- TechCrunch, VentureBeat
- Insurance Journal and other trade publications

## Key Features
1. **Universal Site Profiles**: Pre-configured for 15+ major news sources
2. **Anti-Bot Bypass**: Handles Cloudflare, rate limiting, TLS fingerprinting
3. **Intelligent Content Extraction**: Site-specific selectors with smart fallbacks
4. **Session Management**: Cookie persistence for multi-request sessions
5. **Rate Limiting**: Per-host token bucket with configurable limits
6. **Paywall Detection**: Identifies and flags paywalled content

## Installation

```bash
# 1. Install dependencies
npm ci

# 2. Run comprehensive test (optional but recommended)
node test-universal-scraper.js

# 3. Commit changes
git add .
git commit -m "Implement universal M&A news scraper with anti-bot bypass"

# 4. Push to deploy
git push origin main
```

## Environment Configuration

Set the following environment variables in Netlify:

```bash
# Core Configuration
netlify env:set HTTP_MAX_RETRIES 5
netlify env:set HTTP_BASE_BACKOFF_MS 3000
netlify env:set HTTP_MAX_BACKOFF_MS 60000
netlify env:set HTTP_DEADLINE_MS 30000

# Proxy (optional, for sites requiring it)
netlify env:set PROXY_URL "your-proxy-url-here"

# API Security (optional)
netlify env:set PUBLIC_API_KEY "your-api-key"
netlify env:set BYPASS_AUTH "false"
```

## Usage

### Basic Request
```bash
curl "https://edgescraperpro.com/.netlify/functions/fetch-url?url=https://www.prnewswire.com/news-releases/example-301234567.html"
```

### Response Format
```json
{
  "success": true,
  "url": "https://www.prnewswire.com/...",
  "title": "Company Announces Major Acquisition",
  "content": "Full article text...",
  "contentHtml": "<p>HTML content...</p>",
  "date": "2025-01-27T12:00:00.000Z",
  "site": "prnewswire.com",
  "category": "pr_wire",
  "extractionMethod": "site-specific",
  "confidence": 0.9,
  "metadata": {
    "wordCount": 450,
    "hasPaywall": false,
    "timestamp": "2025-01-27T15:30:00.000Z"
  },
  "httpMetrics": {
    "total": 1,
    "successful": 1,
    "failed": 0,
    "successRate": "100.00%",
    "byCategory": {
      "pr_wire": { "total": 1, "successful": 1 }
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "HTTP 429: Too Many Requests",
  "errorClass": "rate_limited",
  "url": "https://example.com/article",
  "httpMetrics": { ... }
}
```

## Site Categories

- **pr_wire**: PR Newswire, Business Wire, Globe Newswire
- **business_intel**: CB Insights, PitchBook
- **news**: Reuters, Bloomberg, WSJ
- **financial**: MarketWatch, Seeking Alpha, Yahoo Finance
- **tech**: TechCrunch, VentureBeat, The Verge
- **trade_pub**: Insurance Journal, Law360

## Rate Limits

Each site has pre-configured rate limits to avoid detection:
- PR Wire Services: 0.25-0.3 requests/second
- Major News: 0.15-0.3 requests/second
- Financial News: 0.25-0.5 requests/second
- Tech News: 0.4 requests/second
- Trade Publications: 0.2 requests/second

## Anti-Bot Features

1. **TLS Fingerprinting**: Matches real Chrome browser
2. **Browser Fingerprinting**: Realistic screen, navigator, canvas, WebGL
3. **User Agent Rotation**: Consistent per domain for sessions
4. **Header Management**: Site-specific headers with proper referrers
5. **Cookie Persistence**: Maintains sessions across requests
6. **Cloudflare Handling**: Automatic challenge detection and response

## Monitoring

```bash
# Check deployment status
netlify status

# View logs
netlify logs:function fetch-url

# Monitor in real-time
netlify watch
```

## Testing

Run the comprehensive test suite:
```bash
node test-universal-scraper.js
```

This tests all major news categories and provides success rates.

## Troubleshooting

1. **Rate Limiting (429 errors)**
   - The system automatically handles rate limits with exponential backoff
   - Check site-specific limits in site-profiles.js

2. **Cloudflare Challenges**
   - The system attempts to solve basic challenges
   - For persistent issues, consider using a proxy

3. **Paywall Detection**
   - The system flags paywalled content
   - Full content may not be available for subscription sites

4. **Low Confidence Scores**
   - Indicates fallback extraction was used
   - Consider adding site-specific selectors

## Support

For issues or enhancements:
1. Check HTTP metrics in responses
2. Review error classifications
3. Add new site profiles as needed
4. Adjust rate limits based on testing