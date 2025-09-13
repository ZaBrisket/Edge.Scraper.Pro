#!/bin/bash

# Script to create M&A scraper with EXACT specification
# NO public/ directory changes, NO sports focus, ONLY M&A components

echo "🎯 Creating M&A News Scraper - CORRECT Implementation"

# Step 1: Create exact directory structure
echo "📁 Creating directories..."
mkdir -p src/lib/extractors
mkdir -p src/lib/discovery
mkdir -p src/config
mkdir -p netlify/functions
mkdir -p scripts
mkdir -p tests

# Step 2: Create ma-extractor.js
echo "📝 Creating src/lib/extractors/ma-extractor.js..."
cat > src/lib/extractors/ma-extractor.js << 'EOF'
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

    this.transactionTypes = {
      'merger': ['merge', 'merging', 'merged', 'merger'],
      'acquisition': ['acquire', 'acquiring', 'acquired', 'acquisition', 'purchase', 'purchased', 'buy', 'bought'],
      'divestiture': ['divest', 'divesting', 'divested', 'divestiture', 'sell', 'selling', 'sold'],
      'joint_venture': ['joint venture', 'JV', 'partnership', 'strategic alliance'],
      'investment': ['invest', 'investment', 'investing', 'stake', 'equity']
    };

    this.datePatterns = [
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g
    ];
  }

  extractDealValue(text) {
    const values = [];
    for (const pattern of this.dealValuePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const value = this.normalizeDealValue(match);
          if (value) values.push(value);
        });
      }
    }
    return values.length > 0 ? values[0] : null;
  }

  normalizeDealValue(valueStr) {
    const match = valueStr.match(/([\d,]+\.?\d*)\s*(billion|million|B|M)/i);
    if (!match) return null;
    
    const number = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2].toLowerCase();
    
    let multiplier = 1;
    if (unit === 'billion' || unit === 'b') multiplier = 1000000000;
    else if (unit === 'million' || unit === 'm') multiplier = 1000000;
    
    return {
      raw: valueStr,
      normalized: number * multiplier,
      display: `$${number} ${unit === 'b' ? 'billion' : unit === 'm' ? 'million' : unit}`
    };
  }

  extractTransactionType(text) {
    const lowercaseText = text.toLowerCase();
    for (const [type, keywords] of Object.entries(this.transactionTypes)) {
      for (const keyword of keywords) {
        if (lowercaseText.includes(keyword)) {
          return type;
        }
      }
    }
    return 'unknown';
  }

  extractCompanies(text) {
    const doc = compromise(text);
    const organizations = doc.organizations().out('array');
    
    const companyPatterns = [
      /(?:^|\s)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:Inc\.|LLC|Corp\.|Corporation|Limited|Ltd\.|Company|Co\.|Group|Holdings)/g,
      /(?:acquires?|acquired by|merges? with|to acquire|will acquire|has acquired)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acquires?|to acquire|will acquire|has acquired)/g
    ];

    const companies = new Set(organizations);
    
    companyPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          companies.add(match[1].trim());
        }
      }
    });

    return Array.from(companies).filter(c => 
      c.length > 2 && 
      !['The', 'This', 'That', 'These', 'Those'].includes(c)
    );
  }

  extractDates(text) {
    const dates = [];
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          try {
            const parsedDate = new Date(match);
            if (!isNaN(parsedDate.getTime())) {
              dates.push({
                raw: match,
                parsed: parsedDate.toISOString().split('T')[0]
              });
            }
          } catch (e) {
            // Skip invalid dates
          }
        });
      }
    }
    return dates;
  }

  extractExecutiveQuotes(text) {
    const quotePatterns = [
      /"([^"]+)"\s*(?:said|says?|stated?|commented?|added?)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/g,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:,\s*[^,]+,)?\s+(?:said|says?|stated?|commented?|added?)[:\s]+"([^"]+)"/g
    ];

    const quotes = [];
    quotePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        quotes.push({
          quote: match[1] || match[2],
          speaker: match[2] || match[1]
        });
      }
    });
    return quotes;
  }

  extractAdvisors(text) {
    const advisorPatterns = [
      /(?:advised by|advisor to|financial advisor|legal advisor|counsel)\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acted as|served as|is acting as)\s+(?:financial advisor|legal counsel|advisor)/g
    ];

    const advisors = new Set();
    advisorPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) advisors.add(match[1].trim());
      }
    });
    return Array.from(advisors);
  }

  extract(html, text) {
    const cleanText = text || this.extractTextFromHTML(html);
    
    return {
      dealValue: this.extractDealValue(cleanText),
      transactionType: this.extractTransactionType(cleanText),
      companies: this.extractCompanies(cleanText),
      dates: this.extractDates(cleanText),
      executiveQuotes: this.extractExecutiveQuotes(cleanText),
      advisors: this.extractAdvisors(cleanText),
      summary: this.generateSummary(cleanText),
      confidence: this.calculateConfidence(cleanText)
    };
  }

  extractTextFromHTML(html) {
    const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    return cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  generateSummary(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').substring(0, 500);
  }

  calculateConfidence(text) {
    let score = 0;
    if (this.extractDealValue(text)) score += 25;
    if (this.extractTransactionType(text) !== 'unknown') score += 25;
    if (this.extractCompanies(text).length >= 2) score += 25;
    if (this.extractDates(text).length > 0) score += 25;
    return score;
  }
}

module.exports = MAExtractor;
EOF

# Step 3: Create ma-url-finder.js
echo "📝 Creating src/lib/discovery/ma-url-finder.js..."
cat > src/lib/discovery/ma-url-finder.js << 'EOF'
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
    
    this.rssFeedUrls = {
      'businesswire': [
        'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtRXQ==',
        'https://www.businesswire.com/rss/home/?feedCode=Home&rss=1'
      ],
      'prnewswire': [
        'https://www.prnewswire.com/rss/financial-services-latest-news.rss',
        'https://www.prnewswire.com/rss/mergers-acquisitions-latest-news.rss'
      ],
      'globenewswire': [
        'https://www.globenewswire.com/RssFeed/keyword/merger',
        'https://www.globenewswire.com/RssFeed/keyword/acquisition'
      ]
    };
  }

  async discoverFromRSS(source) {
    const urls = [];
    const feeds = this.rssFeedUrls[source] || [];
    
    for (const feedUrl of feeds) {
      try {
        const response = await axios.get(feedUrl, { timeout: 10000 });
        const result = await parseStringPromise(response.data);
        
        if (result.rss && result.rss.channel) {
          const items = result.rss.channel[0].item || [];
          items.forEach(item => {
            if (item.link && item.link[0]) {
              const title = item.title ? item.title[0] : '';
              if (this.isMARelated(title)) {
                urls.push({
                  url: item.link[0],
                  title: title,
                  date: item.pubDate ? item.pubDate[0] : null,
                  source: source
                });
              }
            }
          });
        }
      } catch (error) {
        console.error(`RSS feed error for ${source}:`, error.message);
      }
    }
    
    return urls;
  }

  async discoverFromSitemap(baseUrl) {
    const urls = [];
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/news-sitemap.xml`,
      `${baseUrl}/sitemap/news.xml`
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, { timeout: 10000 });
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        $('url loc').each((i, elem) => {
          const url = $(elem).text();
          if (url && this.isMARelated(url)) {
            urls.push({
              url: url,
              source: new URL(baseUrl).hostname
            });
          }
        });
        
        if (urls.length > 0) break;
      } catch (error) {
        // Silently continue to next sitemap URL
      }
    }
    
    return urls;
  }

  async searchNewsAPI(keywords, dateFrom, dateTo) {
    const urls = [];
    const searchEndpoints = [
      {
        url: 'https://www.businesswire.com/portal/site/home/search/',
        params: { searchType: 'news', searchTerm: keywords }
      },
      {
        url: 'https://www.prnewswire.com/search/news/',
        params: { keyword: keywords, pagesize: 25 }
      }
    ];
    
    for (const endpoint of searchEndpoints) {
      try {
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const $ = cheerio.load(response.data);
        $('a[href*="news-releases"], a[href*="news/"], .news-link, .release-link').each((i, elem) => {
          const href = $(elem).attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `https://${new URL(endpoint.url).hostname}${href}`;
            urls.push({
              url: fullUrl,
              title: $(elem).text().trim(),
              source: new URL(endpoint.url).hostname
            });
          }
        });
      } catch (error) {
        console.error(`Search API error:`, error.message);
      }
    }
    
    return urls;
  }

  isMARelated(text) {
    const lowerText = text.toLowerCase();
    return this.maKeywords.some(keyword => lowerText.includes(keyword));
  }

  async discover(options = {}) {
    const {
      sources = ['businesswire', 'prnewswire', 'globenewswire'],
      keywords = '',
      dateFrom = null,
      dateTo = null,
      maxUrls = 100
    } = options;
    
    const allUrls = [];
    
    // Discover from RSS feeds
    for (const source of sources) {
      const rssUrls = await this.discoverFromRSS(source);
      allUrls.push(...rssUrls);
    }
    
    // Search with keywords if provided
    if (keywords) {
      const searchUrls = await this.searchNewsAPI(keywords, dateFrom, dateTo);
      allUrls.push(...searchUrls);
    }
    
    // Deduplicate and limit
    const uniqueUrls = Array.from(new Map(allUrls.map(item => [item.url, item])).values());
    return uniqueUrls.slice(0, maxUrls);
  }
}

module.exports = MAUrlFinder;
EOF

# Step 4: Create news-sources.js
echo "📝 Creating src/config/news-sources.js..."
cat > src/config/news-sources.js << 'EOF'
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
    'prnewswire': {
      baseUrl: 'https://www.prnewswire.com',
      searchUrl: 'https://www.prnewswire.com/search/news/',
      selectors: {
        title: 'h1.release-title, h1.newsreleaseconstituenttitle',
        date: 'p.release-date, .release-date-time',
        body: 'section.release-body, .release-body-container, article.news-release',
        ticker: 'span.ticker-symbol, .stock-ticker',
        location: 'span.location, .dateline'
      },
      rateLimit: { rps: 1, burst: 3, retryAfter: 10000 }
    },
    'globenewswire': {
      baseUrl: 'https://www.globenewswire.com',
      searchUrl: 'https://www.globenewswire.com/search/',
      selectors: {
        title: 'h1.main-title, .article-title',
        date: 'span.article-published, .publish-date',
        body: 'div.main-body-container, .article-body',
        tags: 'div.tags-container a, .article-tags',
        source: 'span.source-name'
      },
      rateLimit: { rps: 1, burst: 2, retryAfter: 8000 }
    },
    'reuters': {
      baseUrl: 'https://www.reuters.com',
      searchUrl: 'https://www.reuters.com/search/news',
      selectors: {
        title: 'h1[data-testid="Heading"], h1.headline',
        date: 'time[datetime], span.date-time',
        body: 'div[data-testid="Body"], .article-body-wrapper',
        author: 'a[data-testid="AuthorName"], .author-name',
        category: 'a[data-testid="SectionName"], .article-section'
      },
      rateLimit: { rps: 0.5, burst: 2, retryAfter: 15000 }
    },
    'bloomberg': {
      baseUrl: 'https://www.bloomberg.com',
      searchUrl: 'https://www.bloomberg.com/search',
      selectors: {
        title: 'h1.headline, h1[data-component="headline"]',
        date: 'time[datetime], .published-at',
        body: 'div.body-content, .article-content',
        author: 'div.author, .byline',
        paywall: 'div.paywall-overlay'
      },
      rateLimit: { rps: 0.3, burst: 1, retryAfter: 20000 }
    }
  },
  
  getSelector: function(source, field) {
    if (this.sources[source] && this.sources[source].selectors[field]) {
      return this.sources[source].selectors[field];
    }
    return null;
  },
  
  getRateLimit: function(source) {
    if (this.sources[source] && this.sources[source].rateLimit) {
      return this.sources[source].rateLimit;
    }
    return { rps: 0.5, burst: 1, retryAfter: 10000 };
  }
};
EOF

# Step 5: Create scrape-ma-news.js
echo "📝 Creating netlify/functions/scrape-ma-news.js..."
cat > netlify/functions/scrape-ma-news.js << 'EOF'
const axios = require('axios');
const cheerio = require('cheerio');
const PQueue = require('p-queue').default;
const MAExtractor = require('../../src/lib/extractors/ma-extractor');
const MAUrlFinder = require('../../src/lib/discovery/ma-url-finder');
const newsSources = require('../../src/config/news-sources');

const extractor = new MAExtractor();
const urlFinder = new MAUrlFinder();

async function scrapeUrl(url, source) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    const $ = cheerio.load(response.data);
    const sourceConfig = newsSources.sources[source] || {};
    
    // Extract using configured selectors
    const extractedData = {
      url: url,
      source: source,
      title: $(sourceConfig.selectors?.title || 'h1').first().text().trim(),
      date: $(sourceConfig.selectors?.date || 'time').first().text().trim(),
      body: $(sourceConfig.selectors?.body || 'article, .content, .body').text().trim(),
      html: response.data
    };
    
    // Apply M&A extraction
    const maData = extractor.extract(response.data, extractedData.body);
    
    return {
      success: true,
      ...extractedData,
      ma_analysis: maData,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      url: url,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      urls = [],
      mode = 'ma',
      discover = false,
      sources = ['businesswire', 'prnewswire'],
      keywords = '',
      dateRange = {},
      concurrency = 3,
      extractionDepth = 'full'
    } = body;
    
    let urlsToScrape = urls;
    
    // Auto-discover URLs if requested
    if (discover || urls.length === 0) {
      const discoveredUrls = await urlFinder.discover({
        sources: sources,
        keywords: keywords,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        maxUrls: 50
      });
      urlsToScrape = discoveredUrls.map(u => u.url);
    }
    
    // Create queue with rate limiting
    const queue = new PQueue({ concurrency: concurrency });
    
    // Process URLs
    const results = await Promise.all(
      urlsToScrape.map(url => {
        const source = sources.find(s => url.includes(s)) || 'unknown';
        return queue.add(() => scrapeUrl(url, source));
      })
    );
    
    // Calculate statistics
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const withMAData = successful.filter(r => r.ma_analysis?.confidence > 50);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats: {
          total: results.length,
          successful: successful.length,
          failed: failed.length,
          ma_detected: withMAData.length
        },
        results: results,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
EOF

# Step 6: Create build script
echo "📝 Creating scripts/build-ma.js..."
cat > scripts/build-ma.js << 'EOF'
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

// Copy index.html to dist if it exists
const indexPath = path.join(process.cwd(), 'index.html');
const distIndexPath = path.join(process.cwd(), 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, distIndexPath);
  console.log('Copied index.html to dist/');
}

console.log('Build complete!');
EOF

# Step 7: Create test file
echo "📝 Creating tests/ma-scraping.test.js..."
cat > tests/ma-scraping.test.js << 'EOF'
const MAExtractor = require('../src/lib/extractors/ma-extractor');
const MAUrlFinder = require('../src/lib/discovery/ma-url-finder');

console.log('Running M&A Scraping Tests...\n');

const extractor = new MAExtractor();
const urlFinder = new MAUrlFinder();

// Test 1: Deal Value Extraction
console.log('Test 1: Deal Value Extraction');
const testTexts = [
  'Microsoft to acquire Activision Blizzard for $68.7 billion',
  'The deal is valued at approximately $3.5 million',
  'Purchase price of USD 500 million'
];

testTexts.forEach(text => {
  const value = extractor.extractDealValue(text);
  console.log(`  Input: "${text}"`);
  console.log(`  Result:`, value);
});

// Test 2: Company Extraction
console.log('\nTest 2: Company Extraction');
const companyText = 'Microsoft Corporation announced today that it will acquire Activision Blizzard Inc. in an all-cash transaction.';
const companies = extractor.extractCompanies(companyText);
console.log('  Found companies:', companies);

// Test 3: Transaction Type
console.log('\nTest 3: Transaction Type Detection');
const transactionTexts = [
  'Company A merges with Company B',
  'XYZ Corp acquires ABC Ltd',
  'Firm divests non-core assets',
  'Strategic joint venture announced'
];

transactionTexts.forEach(text => {
  const type = extractor.extractTransactionType(text);
  console.log(`  "${text}" -> ${type}`);
});

// Test 4: Date Extraction
console.log('\nTest 4: Date Extraction');
const dateText = 'The transaction was announced on January 15, 2024 and is expected to close by 12/31/2024.';
const dates = extractor.extractDates(dateText);
console.log('  Found dates:', dates);

// Test 5: URL Discovery
console.log('\nTest 5: URL Discovery (checking configuration)');
console.log('  RSS feeds configured for:', Object.keys(urlFinder.rssFeedUrls));
console.log('  M&A keywords:', urlFinder.maKeywords.slice(0, 5).join(', '), '...');

console.log('\n✅ All tests completed!');
EOF

# Step 8: Create .env file
echo "📝 Creating .env file..."
cat > .env << 'EOF'
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
EOF

# Step 9: Show what needs to be added to existing files
echo ""
echo "📋 MANUAL UPDATES REQUIRED:"
echo ""
echo "1. UPDATE package.json - Add these scripts:"
echo '   "build:ma": "node scripts/build-ma.js",'
echo '   "test:ma": "node tests/ma-scraping.test.js"'
echo ""
echo "2. UPDATE netlify.toml - Add to [functions] section:"
echo '   external_node_modules = ["natural", "compromise", "jsdom"]'
echo '   included_files = ["src/**/*.js", "src/**/*.json"]'
echo ""
echo "3. UPDATE index.html - Add M&A UI panel (see MA_HTML_SNIPPET.txt)"
echo ""

# Create HTML snippet file
cat > MA_HTML_SNIPPET.txt << 'EOF'
<!-- Add this before closing </body> tag in index.html -->
<style>
  .ma-config-panel {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }
  
  .ma-config-panel h3 {
    margin-top: 0;
    color: #333;
  }
  
  .config-section {
    margin: 15px 0;
  }
  
  .config-section label {
    display: block;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .source-checkbox {
    margin-right: 15px;
  }
  
  .date-input {
    margin-right: 10px;
    padding: 5px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .keywords-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  .ma-scrape-btn {
    background: #4CAF50;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    margin-top: 15px;
  }
  
  .ma-scrape-btn:hover {
    background: #45a049;
  }
  
  .ma-scrape-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .ma-results {
    margin-top: 20px;
    padding: 20px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  
  .ma-result-item {
    border-bottom: 1px solid #eee;
    padding: 15px 0;
  }
  
  .ma-result-item:last-child {
    border-bottom: none;
  }
  
  .deal-value {
    color: #4CAF50;
    font-weight: bold;
    font-size: 18px;
  }
  
  .companies {
    color: #2196F3;
    font-weight: bold;
  }
  
  .confidence-score {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
  }
  
  .confidence-high {
    background: #4CAF50;
    color: white;
  }
  
  .confidence-medium {
    background: #FFC107;
    color: black;
  }
  
  .confidence-low {
    background: #f44336;
    color: white;
  }
</style>

<div class="ma-config-panel" id="maConfigPanel">
  <h3>🏢 M&A News Scraping Configuration</h3>
  
  <div class="config-section">
    <label>News Sources:</label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-source" value="businesswire" checked> BusinessWire
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-source" value="prnewswire" checked> PR Newswire
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-source" value="globenewswire"> GlobeNewswire
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-source" value="reuters"> Reuters
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-source" value="bloomberg"> Bloomberg
    </label>
  </div>
  
  <div class="config-section">
    <label>Date Range (Optional):</label>
    <input type="date" id="maDateFrom" class="date-input">
    <span>to</span>
    <input type="date" id="maDateTo" class="date-input">
  </div>
  
  <div class="config-section">
    <label>Keywords (Companies, sectors, or deal types):</label>
    <input type="text" id="maKeywords" class="keywords-input" 
           placeholder="e.g., Microsoft, technology, acquisition">
  </div>
  
  <div class="config-section">
    <label>Extraction Options:</label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-field" value="dealValue" checked> Deal Value
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-field" value="parties" checked> Transaction Parties
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-field" value="advisors" checked> Advisors
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-field" value="quotes"> Executive Quotes
    </label>
    <label class="source-checkbox">
      <input type="checkbox" name="ma-field" value="dates" checked> Key Dates
    </label>
  </div>
  
  <div class="config-section">
    <label class="source-checkbox">
      <input type="checkbox" id="maAutoDiscover"> Auto-discover M&A news URLs
    </label>
  </div>
  
  <button id="maScrapeBtn" class="ma-scrape-btn">🚀 Scrape M&A News</button>
  
  <div id="maResults" class="ma-results" style="display: none;"></div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
  const maScrapeBtn = document.getElementById('maScrapeBtn');
  const maResults = document.getElementById('maResults');
  
  maScrapeBtn.addEventListener('click', async function() {
    // Disable button during scraping
    maScrapeBtn.disabled = true;
    maScrapeBtn.textContent = '⏳ Scraping...';
    maResults.style.display = 'none';
    
    // Gather configuration
    const sources = Array.from(document.querySelectorAll('input[name="ma-source"]:checked'))
      .map(cb => cb.value);
    
    const dateFrom = document.getElementById('maDateFrom').value;
    const dateTo = document.getElementById('maDateTo').value;
    const keywords = document.getElementById('maKeywords').value;
    const autoDiscover = document.getElementById('maAutoDiscover').checked;
    
    // Get URLs from main textarea if not auto-discovering
    const urlTextarea = document.getElementById('urls');
    const urls = !autoDiscover && urlTextarea ? 
      urlTextarea.value.split('\n').filter(u => u.trim()) : [];
    
    try {
      const response = await fetch('/.netlify/functions/scrape-ma-news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          urls: urls,
          mode: 'ma',
          discover: autoDiscover,
          sources: sources,
          keywords: keywords,
          dateRange: {
            from: dateFrom,
            to: dateTo
          },
          concurrency: 3,
          extractionDepth: 'full'
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        displayMAResults(data);
      } else {
        alert('Scraping failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      maScrapeBtn.disabled = false;
      maScrapeBtn.textContent = '🚀 Scrape M&A News';
    }
  });
  
  function displayMAResults(data) {
    maResults.style.display = 'block';
    
    let html = `
      <h3>📊 M&A Scraping Results</h3>
      <p><strong>Summary:</strong> ${data.stats.successful} successful | ${data.stats.failed} failed | ${data.stats.ma_detected} M&A deals detected</p>
    `;
    
    const maDeals = data.results.filter(r => r.success && r.ma_analysis?.confidence > 50);
    
    if (maDeals.length > 0) {
      html += '<h4>🎯 Detected M&A Transactions:</h4>';
      
      maDeals.forEach(deal => {
        const ma = deal.ma_analysis;
        const confidenceClass = ma.confidence >= 75 ? 'confidence-high' : 
                               ma.confidence >= 50 ? 'confidence-medium' : 'confidence-low';
        
        html += `
          <div class="ma-result-item">
            <h5>${deal.title || 'Untitled'}</h5>
            <p><a href="${deal.url}" target="_blank">${deal.url}</a></p>
            ${ma.dealValue ? `<p class="deal-value">💰 ${ma.dealValue.display}</p>` : ''}
            ${ma.companies.length > 0 ? `<p class="companies">🏢 ${ma.companies.join(' • ')}</p>` : ''}
            <p>📝 Type: ${ma.transactionType}</p>
            ${ma.dates.length > 0 ? `<p>📅 Date: ${ma.dates[0].parsed}</p>` : ''}
            ${ma.advisors.length > 0 ? `<p>👥 Advisors: ${ma.advisors.join(', ')}</p>` : ''}
            <span class="confidence-score ${confidenceClass}">Confidence: ${ma.confidence}%</span>
          </div>
        `;
      });
    } else {
      html += '<p>No M&A transactions detected in the scraped content.</p>';
    }
    
    // Add export button
    html += `
      <button onclick="exportMAResults()" style="margin-top: 20px; padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
        📥 Export Results (JSON)
      </button>
    `;
    
    maResults.innerHTML = html;
    
    // Store results for export
    window.maScrapingResults = data;
  }
  
  window.exportMAResults = function() {
    if (!window.maScrapingResults) return;
    
    const dataStr = JSON.stringify(window.maScrapingResults, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ma-scraping-results-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
});
</script>
EOF

# Verify files created
echo ""
echo "✅ VERIFICATION:"
test -f src/lib/extractors/ma-extractor.js && echo "✓ MA Extractor exists" || echo "✗ MA Extractor missing"
test -f src/lib/discovery/ma-url-finder.js && echo "✓ URL Finder exists" || echo "✗ URL Finder missing"
test -f src/config/news-sources.js && echo "✓ News Sources exists" || echo "✗ News Sources missing"
test -f netlify/functions/scrape-ma-news.js && echo "✓ Netlify function exists" || echo "✗ Netlify function missing"
test -f scripts/build-ma.js && echo "✓ Build script exists" || echo "✗ Build script missing"
test -f tests/ma-scraping.test.js && echo "✓ Test file exists" || echo "✗ Test file missing"
test -f .env && echo "✓ .env file exists" || echo "✗ .env file missing"

echo ""
echo "📊 FILES CREATED:"
find . -name "ma-*.js" -o -name "news-sources.js" -o -name "build-ma.js" | wc -l
echo "files (should be 7)"

echo ""
echo "📋 NEXT STEPS:"
echo "1. Review MA_HTML_SNIPPET.txt for index.html updates"
echo "2. Update package.json with the scripts shown above"
echo "3. Update netlify.toml with the settings shown above"
echo "4. Run: npm install"
echo "5. Run: npm run test:ma"
echo "6. Commit ONLY these changes"