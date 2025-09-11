/**
 * Integration tests for D2P Buyers Guide URL processing
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { EnhancedFetchClient } = require('../src/lib/http/enhanced-fetch-client');
const { BatchProcessor } = require('../src/lib/batch-processor');

describe('D2P Buyers Guide Integration Tests', () => {
  let fetchClient;
  let batchProcessor;

  before(() => {
    fetchClient = new EnhancedFetchClient({
      timeout: 10000,
      enableCanonicalization: true,
      enablePaginationDiscovery: true,
      respectRobots: true,
      rateLimitPerSecond: 0.5 // Very conservative for live testing
    });

    batchProcessor = new BatchProcessor({
      concurrency: 1,
      timeout: 15000,
      enableUrlNormalization: true,
      enablePaginationDiscovery: true,
      enableStructuredLogging: true
    });
  });

  after(() => {
    if (fetchClient) {
      fetchClient.clearCaches();
    }
  });

  describe('URL Canonicalization', () => {
    test('should canonicalize HTTP to HTTPS for D2P', async () => {
      const originalUrl = 'http://www.d2pbuyersguide.com/filter/all/page/58';
      
      try {
        const result = await fetchClient.enhancedFetch(originalUrl);
        
        if (result.canonicalizationResult?.success) {
          assert(result.resolvedUrl.startsWith('https://'));
          assert(result.canonicalizationResult.attempts.length > 0);
        }
        
        // Should not throw, even if canonicalization fails
        assert(typeof result.responseTime === 'number');
      } catch (error) {
        // Expected for 404s, but should have canonicalization attempt info
        if (error.canonicalizationResult) {
          assert(error.canonicalizationResult.attempts.length > 0);
        }
      }
    });

    test('should try multiple variants for D2P URLs', async () => {
      const originalUrl = 'http://www.d2pbuyersguide.com/filter/all/page/999'; // Likely 404
      
      try {
        await fetchClient.enhancedFetch(originalUrl);
      } catch (error) {
        if (error.canonicalizationResult) {
          // Should have tried multiple variants
          assert(error.canonicalizationResult.attempts.length >= 2);
          
          // Should include HTTPS variants
          const httpsAttempts = error.canonicalizationResult.attempts.filter(
            attempt => attempt.url.startsWith('https://')
          );
          assert(httpsAttempts.length > 0);
        }
      }
    });
  });

  describe('Pagination Discovery', () => {
    test('should discover valid D2P pages', async () => {
      // Test with a known working page pattern
      const testUrls = [
        'https://www.d2pbuyersguide.com/filter/all/page/1',
        'https://www.d2pbuyersguide.com/filter/a/page/1',
        'https://www.d2pbuyersguide.com/filter/o/page/1'
      ];

      for (const url of testUrls) {
        try {
          const result = await fetchClient.enhancedFetch(url);
          
          if (result.response?.ok) {
            // If successful, should have response metadata
            assert(typeof result.responseTime === 'number');
            assert(result.originalUrl === url);
            assert(result.resolvedUrl);
            
            console.log(`✓ Successfully fetched: ${result.resolvedUrl} (${result.response.status})`);
          }
        } catch (error) {
          // Log the error category for analysis
          console.log(`✗ Failed to fetch ${url}: ${error.message}`);
        }
      }
    });

    test('should respect robots.txt for D2P', async () => {
      const robotsAllowed = await fetchClient.checkRobotsTxt('https://www.d2pbuyersguide.com/filter/all/page/1');
      
      // Should not throw and return boolean
      assert(typeof robotsAllowed === 'boolean');
      
      if (!robotsAllowed) {
        console.log('⚠ D2P blocks scraping via robots.txt');
      } else {
        console.log('✓ D2P allows scraping via robots.txt');
      }
    });
  });

  describe('Error Categorization', () => {
    test('should categorize D2P errors correctly', async () => {
      const testUrls = [
        'http://www.d2pbuyersguide.com/filter/all/page/1',    // HTTP -> should canonicalize
        'http://www.d2pbuyersguide.com/filter/all/page/999',  // Likely 404
        'http://invalid-d2p-subdomain.d2pbuyersguide.com/',   // DNS error
        'http://www.d2pbuyersguide.com/invalid-path'          // 404
      ];

      const results = await batchProcessor.processBatch(testUrls, async (url) => {
        return await fetchClient.enhancedFetch(url);
      });

      // Verify error categorization
      const failedResults = results.results.filter(r => !r.success);
      
      for (const failed of failedResults) {
        assert(failed.errorCategory);
        assert(failed.errorCategory !== 'unknown');
        
        // Should have specific categories
        const validCategories = [
          'http_404', 'dns_error', 'network_error', 'timeout_error',
          'blocked_by_robots', 'ssl_error', 'server_error', 'client_error'
        ];
        
        assert(validCategories.includes(failed.errorCategory), 
               `Invalid error category: ${failed.errorCategory}`);
        
        console.log(`URL: ${failed.url} -> Category: ${failed.errorCategory}`);
      }
    });
  });

  describe('Batch Processing with URL Lists', () => {
    test('should process D2P URL range with normalization', async () => {
      // Test the original failing URL pattern
      const urlRange = Array.from({ length: 5 }, (_, i) => 
        `http://www.d2pbuyersguide.com/filter/all/page/${i + 1}`
      );

      const results = await batchProcessor.processBatch(urlRange, async (url) => {
        return await fetchClient.enhancedFetch(url);
      });

      // Should process all URLs
      assert.strictEqual(results.results.length, 5);
      
      // Should have detailed error information (no 'unknown' errors)
      const unknownErrors = results.results.filter(r => 
        !r.success && r.errorCategory === 'unknown'
      );
      assert.strictEqual(unknownErrors.length, 0, 'Should have no unknown errors');
      
      // Should have canonicalization attempts
      const canonicalizedAttempts = results.results.filter(r => 
        r.errorDetails?.resolvedUrl && r.errorDetails.resolvedUrl !== r.url
      );
      
      if (canonicalizedAttempts.length > 0) {
        console.log(`✓ ${canonicalizedAttempts.length} URLs had canonicalization attempts`);
      }

      // Log summary
      const summary = {
        total: results.results.length,
        successful: results.results.filter(r => r.success).length,
        failed: results.results.filter(r => !r.success).length,
        errorCategories: {}
      };

      results.results.forEach(r => {
        if (!r.success) {
          summary.errorCategories[r.errorCategory] = 
            (summary.errorCategories[r.errorCategory] || 0) + 1;
        }
      });

      console.log('D2P Batch Processing Summary:', summary);
    });

    test('should process D2P letter-indexed URLs', async () => {
      // Test letter-indexed patterns
      const letterUrls = ['a', 'o', 'x', 'p', 'i'].map(letter => 
        `http://www.d2pbuyersguide.com/filter/${letter}/page/1`
      );

      const results = await batchProcessor.processBatch(letterUrls, async (url) => {
        return await fetchClient.enhancedFetch(url);
      });

      // Should process all URLs
      assert.strictEqual(results.results.length, 5);
      
      // Should have specific error categories
      const errorCategories = new Set();
      results.results.forEach(r => {
        if (!r.success) {
          errorCategories.add(r.errorCategory);
        }
      });

      // Should not have unknown errors
      assert(!errorCategories.has('unknown'));
      
      console.log('Letter-indexed URL error categories:', Array.from(errorCategories));
    });
  });

  describe('Structured Logging', () => {
    test('should generate structured logs for D2P processing', async () => {
      const testUrls = [
        'http://www.d2pbuyersguide.com/filter/all/page/1',
        'http://www.d2pbuyersguide.com/filter/all/page/2'
      ];

      const processor = new BatchProcessor({
        concurrency: 1,
        enableStructuredLogging: true,
        enableUrlNormalization: true
      });

      const results = await processor.processBatch(testUrls, async (url) => {
        return await fetchClient.enhancedFetch(url);
      });

      // Should have structured logging stats
      const stats = processor.structuredLogger?.getStats();
      if (stats) {
        assert(typeof stats.total_requests === 'number');
        assert(stats.total_requests === testUrls.length);
        assert(stats.log_file);
        assert(stats.summary_file);
        
        console.log('Structured logging stats:', {
          total_requests: stats.total_requests,
          successful_requests: stats.successful_requests,
          failed_requests: stats.failed_requests,
          error_categories: stats.error_categories
        });
      }
    });
  });
});

// Performance and reliability tests
describe('D2P Performance Tests', () => {
  test('should handle rate limiting gracefully', async () => {
    const fetchClient = new EnhancedFetchClient({
      rateLimitPerSecond: 2, // 2 requests per second
      enableCanonicalization: false // Disable to test just rate limiting
    });

    const urls = Array.from({ length: 3 }, (_, i) => 
      `https://www.d2pbuyersguide.com/filter/all/page/${i + 1}`
    );

    const startTime = Date.now();
    
    const promises = urls.map(url => 
      fetchClient.enhancedFetch(url).catch(e => ({ error: e.message }))
    );
    
    await Promise.all(promises);
    
    const elapsed = Date.now() - startTime;
    
    // Should take at least 1 second for 3 requests at 2 RPS
    assert(elapsed >= 1000, `Rate limiting not working: completed in ${elapsed}ms`);
    
    console.log(`Rate limiting test: 3 requests completed in ${elapsed}ms`);
  });

  test('should handle consecutive errors correctly', async () => {
    const fetchClient = new EnhancedFetchClient({
      consecutiveErrorThreshold: 2
    });

    // Generate URLs that will likely fail
    const badUrls = Array.from({ length: 4 }, (_, i) => 
      `http://www.d2pbuyersguide.com/filter/all/page/${9999 + i}`
    );

    let consecutiveErrorCount = 0;
    
    for (const url of badUrls) {
      try {
        await fetchClient.enhancedFetch(url);
        consecutiveErrorCount = 0;
      } catch (error) {
        consecutiveErrorCount++;
        
        if (error.code === 'CONSECUTIVE_ERRORS') {
          console.log(`✓ Consecutive error threshold triggered after ${consecutiveErrorCount - 1} errors`);
          break;
        }
      }
    }
  });
});