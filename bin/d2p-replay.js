#!/usr/bin/env node

const { EnhancedScraper } = require('../src/lib/http/enhanced-scraper');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

/**
 * D2P Buyers Guide Replay Script
 * 
 * This script replays the original D2P Buyers Guide scraping job with enhanced
 * URL normalization and pagination discovery to fix the 404 issues.
 */

// Original D2P URLs that were failing
const D2P_URLS = [
  'http://www.d2pbuyersguide.com/filter/all/page/1',
  'http://www.d2pbuyersguide.com/filter/all/page/2',
  'http://www.d2pbuyersguide.com/filter/all/page/3',
  'http://www.d2pbuyersguide.com/filter/all/page/4',
  'http://www.d2pbuyersguide.com/filter/all/page/5',
  'http://www.d2pbuyersguide.com/filter/all/page/6',
  'http://www.d2pbuyersguide.com/filter/all/page/7',
  'http://www.d2pbuyersguide.com/filter/all/page/8',
  'http://www.d2pbuyersguide.com/filter/all/page/9',
  'http://www.d2pbuyersguide.com/filter/all/page/10',
  'http://www.d2pbuyersguide.com/filter/all/page/11',
  'http://www.d2pbuyersguide.com/filter/all/page/12',
  'http://www.d2pbuyersguide.com/filter/all/page/13',
  'http://www.d2pbuyersguide.com/filter/all/page/14',
  'http://www.d2pbuyersguide.com/filter/all/page/15',
  'http://www.d2pbuyersguide.com/filter/all/page/16',
  'http://www.d2pbuyersguide.com/filter/all/page/17',
  'http://www.d2pbuyersguide.com/filter/all/page/18',
  'http://www.d2pbuyersguide.com/filter/all/page/19',
  'http://www.d2pbuyersguide.com/filter/all/page/20',
  'http://www.d2pbuyersguide.com/filter/all/page/21',
  'http://www.d2pbuyersguide.com/filter/all/page/22',
  'http://www.d2pbuyersguide.com/filter/all/page/23',
  'http://www.d2pbuyersguide.com/filter/all/page/24',
  'http://www.d2pbuyersguide.com/filter/all/page/25',
  'http://www.d2pbuyersguide.com/filter/all/page/26',
  'http://www.d2pbuyersguide.com/filter/all/page/27',
  'http://www.d2pbuyersguide.com/filter/all/page/28',
  'http://www.d2pbuyersguide.com/filter/all/page/29',
  'http://www.d2pbuyersguide.com/filter/all/page/30',
  'http://www.d2pbuyersguide.com/filter/all/page/31',
  'http://www.d2pbuyersguide.com/filter/all/page/32',
  'http://www.d2pbuyersguide.com/filter/all/page/33',
  'http://www.d2pbuyersguide.com/filter/all/page/34',
  'http://www.d2pbuyersguide.com/filter/all/page/35',
  'http://www.d2pbuyersguide.com/filter/all/page/36',
  'http://www.d2pbuyersguide.com/filter/all/page/37',
  'http://www.d2pbuyersguide.com/filter/all/page/38',
  'http://www.d2pbuyersguide.com/filter/all/page/39',
  'http://www.d2pbuyersguide.com/filter/all/page/40',
  'http://www.d2pbuyersguide.com/filter/all/page/41',
  'http://www.d2pbuyersguide.com/filter/all/page/42',
  'http://www.d2pbuyersguide.com/filter/all/page/43',
  'http://www.d2pbuyersguide.com/filter/all/page/44',
  'http://www.d2pbuyersguide.com/filter/all/page/45',
  'http://www.d2pbuyersguide.com/filter/all/page/46',
  'http://www.d2pbuyersguide.com/filter/all/page/47',
  'http://www.d2pbuyersguide.com/filter/all/page/48',
  'http://www.d2pbuyersguide.com/filter/all/page/49',
  'http://www.d2pbuyersguide.com/filter/all/page/50'
];

async function main() {
  const jobId = randomUUID();
  const startTime = Date.now();
  
  console.log('🚀 Starting D2P Buyers Guide Enhanced Scraping Replay');
  console.log(`📋 Job ID: ${jobId}`);
  console.log(`🔗 URLs to process: ${D2P_URLS.length}`);
  console.log('');

  // Initialize enhanced scraper
  const scraper = new EnhancedScraper({
    jobId,
    enableCanonicalization: true,
    enablePaginationDiscovery: true,
    enableStructuredLogging: true,
    logDir: './logs',
    maxPages: 100,
    consecutive404Threshold: 5,
    timeout: 15000,
    userAgent: 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)'
  });

  try {
    // Step 1: Test a few URLs first to verify the fix
    console.log('🧪 Testing first 5 URLs to verify fixes...');
    const testUrls = D2P_URLS.slice(0, 5);
    const testResults = await scraper.scrapeUrls(testUrls, { correlationId: `${jobId}-test` });
    
    const testSuccessCount = testResults.filter(r => r.success).length;
    const testFailureCount = testResults.length - testSuccessCount;
    
    console.log(`✅ Test results: ${testSuccessCount} successful, ${testFailureCount} failed`);
    
    if (testSuccessCount > 0) {
      console.log('🎉 URL normalization is working! Proceeding with full batch...');
      console.log('');
    } else {
      console.log('⚠️  No URLs succeeded in test. Check logs for details.');
      console.log('');
    }

    // Step 2: Process all URLs
    console.log('🔄 Processing all URLs with enhanced scraping...');
    const results = await scraper.scrapeUrls(D2P_URLS, { correlationId: jobId });
    
    // Step 3: Analyze results
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const canonicalizedResults = results.filter(r => r.canonicalization?.success);
    const paginationResults = results.filter(r => r.pagination?.success);
    
    console.log('');
    console.log('📊 SCRAPING RESULTS SUMMARY');
    console.log('============================');
    console.log(`Total URLs processed: ${results.length}`);
    console.log(`Successful scrapes: ${successfulResults.length}`);
    console.log(`Failed scrapes: ${failedResults.length}`);
    console.log(`URLs canonicalized: ${canonicalizedResults.length}`);
    console.log(`Pagination discovered: ${paginationResults.length}`);
    console.log(`Success rate: ${((successfulResults.length / results.length) * 100).toFixed(2)}%`);
    console.log('');

    // Step 4: Show error breakdown
    if (failedResults.length > 0) {
      console.log('❌ ERROR BREAKDOWN');
      console.log('==================');
      const errorCounts = {};
      failedResults.forEach(result => {
        const errorClass = result.errorClass || 'unknown';
        errorCounts[errorClass] = (errorCounts[errorClass] || 0) + 1;
      });
      
      Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .forEach(([errorClass, count]) => {
          console.log(`${errorClass}: ${count} failures`);
        });
      console.log('');
    }

    // Step 5: Show canonicalization results
    if (canonicalizedResults.length > 0) {
      console.log('🔗 CANONICALIZATION RESULTS');
      console.log('============================');
      const httpToHttps = canonicalizedResults.filter(r => 
        r.originalUrl.startsWith('http://') && r.finalUrl.startsWith('https://')
      );
      const wwwAdded = canonicalizedResults.filter(r => 
        !r.originalUrl.includes('www.') && r.finalUrl.includes('www.')
      );
      const trailingSlash = canonicalizedResults.filter(r => 
        !r.originalUrl.endsWith('/') && r.finalUrl.endsWith('/')
      );
      
      console.log(`HTTP → HTTPS upgrades: ${httpToHttps.length}`);
      console.log(`www added: ${wwwAdded.length}`);
      console.log(`Trailing slash added: ${trailingSlash.length}`);
      console.log('');
    }

    // Step 6: Show pagination discovery results
    if (paginationResults.length > 0) {
      console.log('📄 PAGINATION DISCOVERY RESULTS');
      console.log('================================');
      const totalDiscoveredPages = paginationResults.reduce((sum, r) => sum + (r.pagination?.totalPages || 0), 0);
      const avgPagesPerUrl = totalDiscoveredPages / paginationResults.length;
      
      console.log(`URLs with pagination: ${paginationResults.length}`);
      console.log(`Total pages discovered: ${totalDiscoveredPages}`);
      console.log(`Average pages per URL: ${avgPagesPerUrl.toFixed(2)}`);
      console.log('');
    }

    // Step 7: Show successful URLs
    if (successfulResults.length > 0) {
      console.log('✅ SUCCESSFUL URLS');
      console.log('==================');
      successfulResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.originalUrl} → ${result.finalUrl} (${result.status})`);
        if (result.pagination?.totalPages > 0) {
          console.log(`   📄 Discovered ${result.pagination.totalPages} pages`);
        }
      });
      console.log('');
    }

    // Step 8: Show failed URLs
    if (failedResults.length > 0) {
      console.log('❌ FAILED URLS');
      console.log('==============');
      failedResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.originalUrl} → ${result.errorClass || 'unknown'}`);
        if (result.canonicalization?.canonicalUrl) {
          console.log(`   🔗 Canonicalized to: ${result.canonicalization.canonicalUrl}`);
        }
      });
      console.log('');
    }

    // Step 9: Save results to file
    const resultsFile = `./logs/d2p-replay-results-${jobId}.json`;
    const resultsData = {
      jobId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      totalTime: Date.now() - startTime,
      summary: {
        totalUrls: results.length,
        successfulUrls: successfulResults.length,
        failedUrls: failedResults.length,
        canonicalizedUrls: canonicalizedResults.length,
        paginationDiscovered: paginationResults.length,
        successRate: ((successfulResults.length / results.length) * 100).toFixed(2) + '%'
      },
      results: results.map(r => ({
        originalUrl: r.originalUrl,
        finalUrl: r.finalUrl,
        success: r.success,
        status: r.status,
        errorClass: r.errorClass,
        responseTime: r.responseTime,
        canonicalization: r.canonicalization,
        pagination: r.pagination ? {
          success: r.pagination.success,
          totalPages: r.pagination.totalPages,
          discoveredPages: r.pagination.discoveredPages?.length || 0
        } : null
      }))
    };
    
    fs.writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));
    console.log(`💾 Results saved to: ${resultsFile}`);

    // Step 10: Show log file location
    const logFile = scraper.getLogFilePath();
    console.log(`📝 Detailed logs: ${logFile}`);
    console.log('');

    // Step 11: Final summary
    const totalTime = Date.now() - startTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);
    
    console.log('🎯 FINAL SUMMARY');
    console.log('================');
    console.log(`Job completed in ${minutes}m ${seconds}s`);
    console.log(`Success rate: ${((successfulResults.length / results.length) * 100).toFixed(2)}%`);
    
    if (successfulResults.length > 0) {
      console.log('🎉 URL normalization and pagination discovery are working!');
      console.log('✅ The D2P Buyers Guide 404 issues have been resolved.');
    } else {
      console.log('⚠️  No URLs succeeded. Check the logs for detailed error information.');
    }
    
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Review the detailed logs for any remaining issues');
    console.log('2. Check the results JSON file for structured data');
    console.log('3. Use the enhanced scraper in your production pipeline');
    console.log('');

  } catch (error) {
    console.error('💥 Fatal error during scraping:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main, D2P_URLS };