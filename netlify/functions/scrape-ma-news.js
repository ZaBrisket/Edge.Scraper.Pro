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