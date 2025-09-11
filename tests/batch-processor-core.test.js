const test = require('node:test');
const assert = require('node:assert');
const timers = require('node:timers/promises');

// Set test environment variables
process.env.HTTP_MAX_RETRIES = '3';
process.env.HTTP_DEADLINE_MS = '5000';
process.env.HTTP_MAX_CONCURRENCY = '5';

const { BatchProcessor, ERROR_CATEGORIES, BATCH_STATES } = require('../src/lib/batch-processor-hardened');

// Test core functionality
test('BatchProcessor core functionality', async (t) => {
  await t.test('validates inputs', async () => {
    const processor = new BatchProcessor();
    
    // Should reject invalid URLs array
    await assert.rejects(
      () => processor.processBatch(null, () => {}),
      /Expected array/
    );
    
    // Should reject invalid processor
    await assert.rejects(
      () => processor.processBatch(['https://example.com'], null),
      /Processor must be a function/
    );
  });
  
  await t.test('processes valid URLs successfully', async () => {
    const processor = new BatchProcessor({ delayMs: 0 });
    
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3'
    ];
    
    const results = {};
    const mockProcessor = async (url) => {
      await timers.setTimeout(10);
      results[url] = { processed: true, timestamp: Date.now() };
      return results[url];
    };
    
    const result = await processor.processBatch(urls, mockProcessor);
    
    assert.strictEqual(result.state, BATCH_STATES.COMPLETED);
    assert.strictEqual(result.stats.successfulUrls, 3);
    assert.strictEqual(result.stats.failedUrls, 0);
    assert.strictEqual(Object.keys(results).length, 3);
  });
  
  await t.test('handles and categorizes errors correctly', async () => {
    const processor = new BatchProcessor({ delayMs: 0 });
    
    const urls = ['https://example.com/1', 'https://example.com/2'];
    
    let count = 0;
    const errorProcessor = async () => {
      count++;
      if (count === 1) {
        const error = new Error('Network error');
        error.code = 'ECONNREFUSED';
        throw error;
      } else {
        const error = new Error('Timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      }
    };
    
    const result = await processor.processBatch(urls, errorProcessor);
    
    assert.strictEqual(result.stats.failedUrls, 2);
    assert.strictEqual(result.stats.successfulUrls, 0);
    assert.ok(result.errorReport);
    assert.ok(result.errorReport.patterns.length > 0);
    
    // Check error categorization
    const networkErrors = result.errorReport.errorsByCategory[ERROR_CATEGORIES.NETWORK];
    const timeoutErrors = result.errorReport.errorsByCategory[ERROR_CATEGORIES.TIMEOUT];
    
    assert.ok(networkErrors);
    assert.ok(timeoutErrors);
  });
  
  await t.test('deduplicates URLs correctly', async () => {
    const processor = new BatchProcessor();
    
    const urls = [
      'https://example.com/page',
      'https://example.com/page',  // Exact duplicate
      'https://example.com/page?utm_source=test',  // Normalized duplicate
      'https://example.com/other'
    ];
    
    const result = await processor.validateAndDeduplicate(urls);
    
    assert.strictEqual(result.validUrls.length, 2);  // Only unique URLs
    assert.strictEqual(result.duplicates.length, 2);  // Two duplicates found
  });
  
  await t.test('validates URLs properly', async () => {
    const processor = new BatchProcessor();
    
    // Valid URL
    assert.deepStrictEqual(
      processor.validateUrl('https://example.com'),
      {
        isValid: true,
        normalized: 'https://example.com/',
        category: 'valid'
      }
    );
    
    // Invalid protocol
    assert.deepStrictEqual(
      processor.validateUrl('ftp://example.com'),
      {
        isValid: false,
        category: 'invalid_protocol',
        error: 'Invalid protocol: ftp:'
      }
    );
    
    // Private host
    assert.deepStrictEqual(
      processor.validateUrl('http://localhost'),
      {
        isValid: false,
        category: 'private_host',
        error: 'Private/localhost URLs are not allowed'
      }
    );
  });
  
  await t.test('respects concurrency limits', async () => {
    const concurrency = 2;
    const processor = new BatchProcessor({ 
      concurrency,
      delayMs: 0
    });
    
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    
    const trackingProcessor = async (url) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await timers.setTimeout(50);
      currentConcurrent--;
      return { url };
    };
    
    const urls = Array(6).fill(null).map((_, i) => `https://example.com/${i}`);
    await processor.processBatch(urls, trackingProcessor);
    
    assert.ok(maxConcurrent <= concurrency, `Max concurrent (${maxConcurrent}) should not exceed limit (${concurrency})`);
  });
  
  await t.test('generates meaningful recommendations', async () => {
    const processor = new BatchProcessor({ delayMs: 0 });
    
    // Create many timeout errors
    const urls = Array(10).fill(null).map((_, i) => `https://example.com/${i}`);
    const timeoutProcessor = async () => {
      const error = new Error('Request timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    };
    
    const result = await processor.processBatch(urls, timeoutProcessor);
    
    assert.ok(result.errorReport.recommendations.length > 0);
    
    const timeoutRec = result.errorReport.recommendations.find(r => r.type === 'timeout');
    assert.ok(timeoutRec);
    assert.strictEqual(timeoutRec.severity, 'high');
    assert.ok(timeoutRec.config);
  });
  
  await t.test('tracks progress correctly', async () => {
    const progressReports = [];
    const processor = new BatchProcessor({
      delayMs: 0,
      onProgress: (progress) => progressReports.push(progress)
    });
    
    const urls = ['https://example.com/1', 'https://example.com/2'];
    await processor.processBatch(urls, async (url) => ({ url }));
    
    // Should have validation and processing reports
    const validationReport = progressReports.find(r => r.phase === 'validation');
    assert.ok(validationReport);
    
    const processingReports = progressReports.filter(r => r.phase === 'processing');
    assert.strictEqual(processingReports.length, 2);
    assert.strictEqual(processingReports[1].completed, 2);
    assert.strictEqual(processingReports[1].percentage, 100);
  });
  
  await t.test('preserves URL order in results', async () => {
    const processor = new BatchProcessor({ delayMs: 0 });
    
    const urls = [
      'https://example.com/3',
      'https://example.com/1',
      'https://example.com/2'
    ];
    
    const mockProcessor = async (url) => ({ url });
    
    const result = await processor.processBatch(urls, mockProcessor);
    
    // Results should be in original order
    assert.strictEqual(result.results[0].url, 'https://example.com/3');
    assert.strictEqual(result.results[1].url, 'https://example.com/1');
    assert.strictEqual(result.results[2].url, 'https://example.com/2');
  });
  
  await t.test('handles pause and resume', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 1,
      delayMs: 0
    });
    
    let processedBeforePause = 0;
    const pauseProcessor = async (url) => {
      processedBeforePause++;
      if (processedBeforePause === 2) {
        processor.pause();
        // Resume after delay
        setTimeout(() => {
          processor.resume();
        }, 50);
      }
      return { url };
    };
    
    const urls = Array(4).fill(null).map((_, i) => `https://example.com/${i}`);
    const startTime = Date.now();
    const result = await processor.processBatch(urls, pauseProcessor);
    const duration = Date.now() - startTime;
    
    assert.strictEqual(result.stats.successfulUrls, 4);
    assert.ok(duration >= 50, 'Should have paused for at least 50ms');
  });
  
  await t.test('cleans up after completion', async () => {
    const processor = new BatchProcessor();
    
    const urls = ['https://example.com'];
    await processor.processBatch(urls, async () => ({}));
    
    // Should be able to start new batch
    await assert.doesNotReject(
      () => processor.processBatch(urls, async () => ({}))
    );
  });
  
  await t.test('limits error report size', async () => {
    const errorReportSize = 10;
    const processor = new BatchProcessor({ 
      delayMs: 0,
      errorReportSize
    });
    
    const urls = Array(50).fill(null).map((_, i) => `https://example.com/${i}`);
    const failingProcessor = async () => {
      throw new Error('Test error');
    };
    
    const result = await processor.processBatch(urls, failingProcessor);
    
    assert.ok(result.errorReport.detailedErrors.length <= errorReportSize);
  });
});