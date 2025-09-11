const test = require('node:test');
const assert = require('node:assert');
const timers = require('node:timers/promises');

// Set test environment variables
process.env.HTTP_MAX_RETRIES = '3';
process.env.HTTP_DEADLINE_MS = '5000';
process.env.HTTP_MAX_CONCURRENCY = '5';

const { BatchProcessor } = require('../src/lib/batch-processor');

// Test timeout cleanup
test('Batch processor timeout cleanup', async (t) => {
  await t.test('cleans up timeout when processing completes successfully', async () => {
    // Track only timeout-related timers (those with reject callbacks)
    const timeoutTimers = new Set();
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    
    // Monkey-patch setTimeout to track only timeout timers
    global.setTimeout = function(callback, delay) {
      const timer = originalSetTimeout.call(this, callback, delay);
      // Check if this is a timeout timer by looking at the callback
      if (callback.toString().includes('reject') || callback.toString().includes('timeout')) {
        timeoutTimers.add(timer);
      }
      return timer;
    };
    
    global.clearTimeout = function(timer) {
      timeoutTimers.delete(timer);
      return originalClearTimeout.call(this, timer);
    };
    
    try {
      const processor = new BatchProcessor({
        delayMs: 0,
        timeout: 1000 // 1 second timeout
      });
      
      const urls = ['https://example.com/1', 'https://example.com/2'];
      
      // Fast processor that completes well before timeout
      const fastProcessor = async (url) => {
        await timers.setTimeout(10); // 10ms processing
        return { url, processed: true };
      };
      
      const result = await processor.processBatch(urls, fastProcessor);
      
      // Give a moment for any cleanup to occur
      await timers.setTimeout(50);
      
      // Check that timeout timers were cleaned up
      assert.strictEqual(result.stats.successfulUrls, 2);
      assert.strictEqual(timeoutTimers.size, 0, 
        'All timeout timers should be cleaned up after successful processing');
      
    } finally {
      // Restore original functions
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
  
  await t.test('cleans up timeout when processing times out', async () => {
    const timeoutTimers = new Set();
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    
    global.setTimeout = function(callback, delay) {
      const timer = originalSetTimeout.call(this, callback, delay);
      if (callback.toString().includes('reject') || callback.toString().includes('timeout')) {
        timeoutTimers.add(timer);
      }
      return timer;
    };
    
    global.clearTimeout = function(timer) {
      timeoutTimers.delete(timer);
      return originalClearTimeout.call(this, timer);
    };
    
    try {
      const processor = new BatchProcessor({
        delayMs: 0,
        timeout: 100 // Minimum allowed timeout
      });
      
      const urls = ['https://example.com/1'];
      
      // Slow processor that will timeout
      const slowProcessor = async (url) => {
        await timers.setTimeout(200); // Longer than timeout
        return { url, processed: true };
      };
      
      const result = await processor.processBatch(urls, slowProcessor);
      
      // Give a moment for cleanup
      await timers.setTimeout(50);
      
      assert.strictEqual(result.stats.failedUrls, 1);
      assert.strictEqual(result.stats.successfulUrls, 0);
      assert.ok(result.results[0].error.includes('timeout'));
      assert.strictEqual(timeoutTimers.size, 0,
        'All timeout timers should be cleaned up even after timeout');
      
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
  
  await t.test('handles multiple concurrent timeouts correctly', async () => {
    const processor = new BatchProcessor({
      delayMs: 0,
      timeout: 100,
      concurrency: 3
    });
    
    const urls = Array(10).fill(null).map((_, i) => `https://example.com/${i}`);
    
    // Mix of fast and slow processors
    let count = 0;
    const mixedProcessor = async (url) => {
      count++;
      if (count % 3 === 0) {
        // Some will timeout
        await timers.setTimeout(200);
      } else {
        // Some will succeed
        await timers.setTimeout(10);
      }
      return { url, processed: true };
    };
    
    const result = await processor.processBatch(urls, mixedProcessor);
    
    // Should have some successes and some failures
    assert.ok(result.stats.successfulUrls > 0, 'Should have some successful URLs');
    assert.ok(result.stats.failedUrls > 0, 'Should have some failed URLs');
    assert.strictEqual(result.stats.successfulUrls + result.stats.failedUrls, 10);
    
    // Check that timeout errors are properly categorized
    const timeoutErrors = result.results.filter(r => 
      !r.success && r.errorCategory === 'timeout'
    );
    assert.ok(timeoutErrors.length > 0, 'Should have timeout errors');
  });
});