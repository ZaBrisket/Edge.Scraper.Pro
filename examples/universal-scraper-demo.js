/**
 * Universal M&A News Scraper Demo
 * Demonstrates scraping from various news sources
 */

const UniversalHttpClient = require('../src/lib/http/universal-client');
const newsExtractor = require('../src/lib/extractors/news-extractor');
const { getSiteProfile } = require('../src/lib/http/site-profiles');

// Example URLs from different categories
const DEMO_URLS = {
  prWire: 'https://www.prnewswire.com/news-releases/insurance-merger-announcement.html',
  reuters: 'https://www.reuters.com/business/insurance-acquisition-deal.html',
  bloomberg: 'https://www.bloomberg.com/news/insurance-ma-activity.html',
  techNews: 'https://techcrunch.com/2025/01/27/insurtech-startup-acquired/',
  tradePublication: 'https://www.insurancejournal.com/news/national/ma-roundup.htm'
};

async function demonstrateScraping() {
  const httpClient = new UniversalHttpClient({
    maxRetries: 3,
    timeout: 20000
  });

  console.log('Universal M&A News Scraper Demo');
  console.log('================================\n');

  for (const [source, url] of Object.entries(DEMO_URLS)) {
    console.log(`\nScraping ${source}...`);
    console.log(`URL: ${url}`);
    
    try {
      // Get site profile
      const siteProfile = getSiteProfile(url);
      console.log(`Site Category: ${siteProfile.category}`);
      console.log(`Rate Limit: ${siteProfile.rateLimit.rps} req/sec`);
      
      // Fetch with protection
      const startTime = Date.now();
      const response = await httpClient.fetchWithProtection(url);
      const html = await response.text();
      
      // Extract content
      const extracted = newsExtractor.extractContent(html, url);
      const elapsed = Date.now() - startTime;
      
      // Display results
      console.log(`\n✓ Success in ${elapsed}ms`);
      console.log(`Title: ${extracted.title?.substring(0, 60)}...`);
      console.log(`Content Preview: ${extracted.content?.substring(0, 150)}...`);
      console.log(`Word Count: ${extracted.metadata?.wordCount || 0}`);
      console.log(`Extraction Method: ${extracted.extractionMethod}`);
      console.log(`Confidence: ${(extracted.confidence * 100).toFixed(0)}%`);
      
      if (extracted.metadata?.hasPaywall) {
        console.log('⚠️  Paywall Detected');
      }
      
    } catch (error) {
      console.log(`\n✗ Error: ${error.message}`);
    }
    
    // Respect rate limits
    await sleep(3000);
  }
  
  // Display final metrics
  console.log('\n\nHTTP Client Metrics:');
  console.log(JSON.stringify(httpClient.getMetrics(), null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run demo
if (require.main === module) {
  demonstrateScraping().catch(console.error);
}

module.exports = { demonstrateScraping };