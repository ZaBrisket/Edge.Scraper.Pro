const axios = require('axios');
const PQueue = require('p-queue').default;
const MANewsExtractor = require('../../src/lib/extractors/ma-news-extractor');
const MAUrlDiscovery = require('../../src/lib/discovery/ma-url-discovery');
const newsSources = require('../../src/config/ma-news-sources');

// Initialize extractors
const extractor = new MANewsExtractor();
const urlDiscovery = new MAUrlDiscovery();

// Rate limiting configuration
const createQueue = (concurrency = 3) => {
  return new PQueue({
    concurrency: concurrency,
    interval: 1000,
    intervalCap: concurrency
  });
};

// Scrape a single URL
async function scrapeUrl(url, sourceInfo) {
  try {
    console.log(`Scraping: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    // Extract M&A data
    const extractedData = extractor.extractFromHTML(response.data, url);
    
    return {
      success: true,
      url: url,
      source: sourceInfo?.name || 'unknown',
      status: response.status,
      data: extractedData,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error scraping ${url}: ${error.message}`);
    
    return {
      success: false,
      url: url,
      source: sourceInfo?.name || 'unknown',
      error: error.message,
      errorType: error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

// Main handler
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed. Use POST.'
      })
    };
  }
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    const {
      urls = [],
      mode = 'ma',
      discover = false,
      sources = ['businesswire', 'prnewswire', 'globenewswire'],
      keywords = '',
      dateRange = {},
      concurrency = 3,
      maxUrls = 50,
      useRSS = true,
      minConfidence = 0
    } = body;
    
    console.log(`MA News Scraper invoked - Mode: ${mode}, Discover: ${discover}, Sources: ${sources.join(',')}`);
    
    let urlsToScrape = [];
    
    // Auto-discover URLs if requested or no URLs provided
    if (discover || urls.length === 0) {
      console.log('Discovering M&A news URLs...');
      
      const discoveredUrls = await urlDiscovery.discover({
        sources: sources,
        keywords: keywords || 'merger acquisition',
        maxUrls: maxUrls,
        useRSS: !!useRSS,
        useSearch: !!keywords,
        useSitemap: false
      });
      
      urlsToScrape = discoveredUrls.map(u => ({
        url: u.url,
        source: u.source,
        title: u.title,
        date: u.date || u.publishedAt || u.pubDate || null
      }));
      
      console.log(`Discovered ${urlsToScrape.length} M&A-related URLs`);
    } else {
      // Use provided URLs
      urlsToScrape = urls.map(url => {
        const sourceInfo = newsSources.getSourceByUrl(url);
        return {
          url: url,
          source: sourceInfo?.key || 'custom'
        };
      });
    }
    
    // Create rate-limited queue
    const queue = createQueue(Math.min(concurrency, 5));
    
    // Process URLs
    const results = await Promise.all(
      urlsToScrape.map(item => 
        queue.add(async () => {
          const res = await scrapeUrl(item.url, newsSources.getSource(item.source));
          // Attach discovered metadata if available
          if (item.title && (!res.data || !res.data.title)) {
            if (!res.data) res.data = {};
            res.data.title = item.title;
          }
          if (item.date) {
            if (!res.data) res.data = {};
            res.data.publishedAt = item.date;
          }
          return res;
        })
      )
    );
    
    // Calculate statistics
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const withMAData = successful.filter(r => (r.data?.confidence || 0) > Math.max(0, minConfidence));
    const withDealValue = successful.filter(r => r.data?.dealValue);
    
    // Sort by confidence
    withMAData.sort((a, b) => (b.data?.confidence || 0) - (a.data?.confidence || 0));
    
    // Response
    const response = {
      success: true,
      mode: mode,
      stats: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        ma_detected: withMAData.length,
        deals_with_value: withDealValue.length
      },
      results: results,
      discovered_urls: discover ? urlsToScrape.length : 0,
      timestamp: new Date().toISOString()
    };
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    
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