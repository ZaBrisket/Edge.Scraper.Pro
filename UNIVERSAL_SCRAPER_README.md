# Universal M&A News Scraper System

A comprehensive web scraping solution designed to handle all major M&A news outlets and PR wire services with intelligent anti-bot bypass and content extraction.

## 🚀 Features

### Universal Site Support
- **PR Wire Services**: PR Newswire, Business Wire, Globe Newswire
- **Business Intelligence**: CB Insights, PitchBook
- **Major News Outlets**: Reuters, Bloomberg, Wall Street Journal
- **Financial News**: MarketWatch, Seeking Alpha, Yahoo Finance
- **Tech News**: TechCrunch, VentureBeat, The Verge
- **Trade Publications**: Insurance Journal, Law360

### Anti-Bot Protection
- Cloudflare challenge handling
- TLS fingerprint spoofing
- Browser fingerprint generation
- Rate limiting per site
- Session management with cookies
- Rotating user agents

### Intelligent Content Extraction
- Site-specific selectors
- Heuristic content scoring
- Paywall detection
- Date parsing
- Metadata extraction

## 📁 Project Structure

```
src/lib/
├── http/
│   ├── site-profiles.js      # Site configurations
│   ├── anti-bot-bypass.js    # Anti-bot protection
│   └── universal-client.js   # HTTP client
├── extractors/
│   └── news-extractor.js     # Content extraction
netlify/functions/
└── fetch-url.js              # Main API endpoint
```

## 🛠️ Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Test the system**:
   ```bash
   node test-universal-scraper.js
   ```

## 🔧 Configuration

### Site Profiles
Each site has a specific configuration in `src/lib/http/site-profiles.js`:

```javascript
'prnewswire.com': {
  category: 'pr_wire',
  rateLimit: { rps: 0.3, burst: 1 },
  requiresBrowser: true,
  selectors: {
    content: ['div.release-body', 'div.news-release'],
    title: ['h1.news-release-title', 'h1'],
    date: ['p.news-release-timepass', 'time']
  }
}
```

### Rate Limiting
Configure per-site rate limits:

```env
HOST_LIMIT__www_prnewswire_com__RPS=0.3
HOST_LIMIT__www_prnewswire_com__BURST=1
```

## 📡 API Usage

### Basic Request
```bash
curl "https://your-domain.com/.netlify/functions/fetch-url?url=https://www.prnewswire.com/news-releases/example"
```

### Response Format
```json
{
  "ok": true,
  "data": {
    "success": true,
    "url": "https://example.com",
    "title": "Article Title",
    "content": "Article content...",
    "contentHtml": "<p>Article content...</p>",
    "date": "2025-01-27T10:00:00.000Z",
    "site": "prnewswire.com",
    "category": "pr_wire",
    "extractionMethod": "site-specific",
    "confidence": 0.9,
    "metadata": {
      "wordCount": 500,
      "hasPaywall": false,
      "timestamp": "2025-01-27T10:00:00.000Z"
    },
    "httpMetrics": {
      "total": 1,
      "successful": 1,
      "failed": 0,
      "successRate": "100%"
    }
  }
}
```

## 🧪 Testing

### Run Full Test Suite
```bash
node test-universal-scraper.js
```

### Test Individual Components
```javascript
const UniversalHttpClient = require('./src/lib/http/universal-client');
const newsExtractor = require('./src/lib/extractors/news-extractor');

// Test HTTP client
const client = new UniversalHttpClient();
const response = await client.fetchWithProtection('https://example.com');

// Test content extraction
const extracted = newsExtractor.extractContent(html, url);
```

## 🔒 Anti-Bot Features

### Browser Fingerprinting
- Realistic screen dimensions
- Proper navigator properties
- Canvas fingerprinting
- WebGL fingerprinting
- Plugin lists

### TLS Fingerprinting
- Chrome-compatible JA3 signature
- Proper cipher suites
- Extension support

### Session Management
- Cookie persistence
- CSRF token handling
- Referrer management

## 📊 Monitoring

### Metrics Tracking
- Success rates by category
- Request timing
- Error classification
- Rate limit compliance

### Error Classification
- `rate_limited`: 429 responses
- `forbidden`: 403 responses
- `paywall`: Paywall detected
- `anti_bot_challenge`: Cloudflare challenges
- `timeout`: Request timeouts

## 🚀 Deployment

### Netlify Deployment
1. **Push to repository**:
   ```bash
   git add .
   git commit -m "Add universal M&A news scraper"
   git push origin main
   ```

2. **Set environment variables**:
   ```bash
   netlify env:set HTTP_MAX_RETRIES 5
   netlify env:set HTTP_BASE_BACKOFF_MS 3000
   netlify env:set HTTP_MAX_BACKOFF_MS 60000
   ```

3. **Monitor deployment**:
   ```bash
   netlify watch
   ```

### Environment Variables
```env
# Core configuration
HTTP_MAX_RETRIES=5
HTTP_BASE_BACKOFF_MS=3000
HTTP_MAX_BACKOFF_MS=60000
HTTP_DEADLINE_MS=30000

# Optional proxy
PROXY_URL=

# Site-specific rate limits
HOST_LIMIT__www_prnewswire_com__RPS=0.3
HOST_LIMIT__www_prnewswire_com__BURST=1
```

## 🔧 Customization

### Adding New Sites
1. Add site profile to `site-profiles.js`
2. Configure selectors and rate limits
3. Test with the site's content

### Custom Extractors
Extend `news-extractor.js` for site-specific logic:

```javascript
// Add custom extraction logic
if (siteProfile.hostname === 'custom-site.com') {
  // Custom extraction logic
}
```

## 📈 Performance

### Expected Success Rates
- **PR Wire Services**: 85-95%
- **Major News Outlets**: 70-85%
- **Financial News**: 80-90%
- **Tech News**: 85-95%
- **Trade Publications**: 90-95%

### Rate Limits
- Conservative limits to avoid detection
- Per-site token bucket algorithm
- Exponential backoff with jitter

## 🛡️ Security

### Best Practices
- Respect robots.txt
- Implement proper rate limiting
- Use realistic browser fingerprints
- Handle errors gracefully
- Monitor for abuse

### Legal Compliance
- Check site terms of service
- Implement proper attribution
- Respect copyright laws
- Use for legitimate purposes only

## 🐛 Troubleshooting

### Common Issues

1. **Rate Limited (429)**:
   - Increase delays between requests
   - Check rate limit configuration
   - Use proxy rotation

2. **Cloudflare Challenge (403)**:
   - Enable browser fingerprinting
   - Use proper headers
   - Implement challenge solving

3. **Content Not Extracted**:
   - Check site selectors
   - Enable intelligent extraction
   - Verify HTML structure

### Debug Mode
Enable detailed logging:

```javascript
const client = new UniversalHttpClient({
  debug: true,
  verbose: true
});
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the test suite for examples