/**
 * Test suite for universal M&A news scraper
 */

const UniversalHttpClient = require('./src/lib/http/universal-client');
const newsExtractor = require('./src/lib/extractors/news-extractor');

const TEST_URLS = {
  'PR Wire Services': [
    'https://www.prnewswire.com/news-releases/example-ma-announcement-301234567.html',
    'https://www.businesswire.com/news/home/20250127005678/en/',
    'https://www.globenewswire.com/news-release/2025/01/27/123456/0/en/'
  ],
  'Business Intelligence': [
    'https://www.cbinsights.com/research/report/example-ma-trends/',
    'https://pitchbook.com/news/articles/example-ma-analysis'
  ],
  'Major News Outlets': [
    'https://www.reuters.com/business/example-merger-announcement-2025-01-27/',
    'https://www.bloomberg.com/news/articles/2025-01-27/example-ma-deal',
    'https://www.wsj.com/articles/example-acquisition-11234567890'
  ],
  'Financial News': [
    'https://www.marketwatch.com/story/example-ma-news-2025-01-27',
    'https://seekingalpha.com/news/3912345-example-merger',
    'https://finance.yahoo.com/news/example-acquisition-123456789.html'
  ],
  'Tech News': [
    'https://techcrunch.com/2025/01/27/example-startup-acquisition/',
    'https://www.theverge.com/2025/1/27/12345678/example-tech-merger',
    'https://venturebeat.com/2025/01/27/example-ma-announcement/'
  ],
  'Trade Publications': [
    'https://www.insurancejournal.com/news/national/2025/01/27/809603.htm',
    'https://www.law360.com/articles/1234567/example-ma-legal-update'
  ]
};

const httpClient = new UniversalHttpClient({
  maxRetries: 3,
  timeout: 20000
});

async function testCategory(category, urls) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${category}`);
  console.log('='.repeat(60));
  
  const results = {
    total: urls.length,
    successful: 0,
    failed: 0,
    errors: []
  };
  
  for (const url of urls) {
    try {
      console.log(`\nTesting: ${url}`);
      const startTime = Date.now();
      
      const response = await httpClient.fetchWithProtection(url);
      const html = await response.text();
      const extracted = newsExtractor.extractContent(html, url);
      
      const elapsed = Date.now() - startTime;
      
      console.log(`✓ Success - ${response.status} - ${elapsed}ms`);
      console.log(`  Title: ${extracted.title?.substring(0, 60)}...`);
      console.log(`  Content: ${extracted.content?.substring(0, 100)}...`);
      console.log(`  Words: ${extracted.metadata?.wordCount || 0}`);
      console.log(`  Method: ${extracted.extractionMethod}`);
      console.log(`  Confidence: ${extracted.confidence}`);
      
      if (extracted.metadata?.hasPaywall) {
        console.log(`  ⚠ Paywall detected`);
      }
      
      results.successful++;
      
    } catch (error) {
      console.log(`✗ Failed: ${error.message}`);
      results.failed++;
      results.errors.push({ url, error: error.message });
    }
    
    // Delay between requests
    await sleep(2000 + Math.random() * 1000);
  }
  
  return results;
}

async function runFullTest() {
  console.log('Universal M&A News Scraper Test Suite');
  console.log('=====================================');
  console.log(`Testing ${Object.values(TEST_URLS).flat().length} URLs across ${Object.keys(TEST_URLS).length} categories`);
  
  const allResults = {};
  
  for (const [category, urls] of Object.entries(TEST_URLS)) {
    allResults[category] = await testCategory(category, urls);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (const [category, results] of Object.entries(allResults)) {
    totalSuccess += results.successful;
    totalFailed += results.failed;
    
    const successRate = (results.successful / results.total * 100).toFixed(1);
    console.log(`${category}: ${results.successful}/${results.total} (${successRate}%)`);
    
    if (results.errors.length > 0) {
      results.errors.forEach(err => {
        console.log(`  - ${err.url}: ${err.error}`);
      });
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  const overallRate = (totalSuccess / (totalSuccess + totalFailed) * 100).toFixed(1);
  console.log(`Overall Success Rate: ${totalSuccess}/${totalSuccess + totalFailed} (${overallRate}%)`);
  
  // Print HTTP metrics
  console.log('\n' + '-'.repeat(60));
  console.log('HTTP Metrics:', httpClient.getMetrics());
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run test
runFullTest().catch(console.error);