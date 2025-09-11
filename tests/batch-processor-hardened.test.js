const test = require('node:test');
const assert = require('node:assert');
const { randomUUID } = require('crypto');
const timers = require('node:timers/promises');

// Set test environment variables
process.env.HTTP_MAX_RETRIES = '3';
process.env.HTTP_DEADLINE_MS = '5000';
process.env.HTTP_MAX_CONCURRENCY = '5';

const { BatchProcessor, ERROR_CATEGORIES, BATCH_STATES } = require('../src/lib/batch-processor-hardened');

// Helper function to create a mock processor
function createMockProcessor(options = {}) {
  const { 
    delay = 10, 
    failureRate = 0,
    errorType = 'network',
    results = {}
  } = options;
  
  let callCount = 0;
  
  return async (url) => {
    callCount++;
    await timers.setTimeout(delay);
    
    if (Math.random() < failureRate) {
      const error = new Error(`Mock ${errorType} error`);
      if (errorType === 'timeout') {
        error.code = 'ETIMEDOUT';
      } else if (errorType === 'network') {
        error.code = 'ECONNREFUSED';
      } else if (errorType === 'rate_limit') {
        error.status = 429;
      }
      throw error;
    }
    
    return results[url] || { data: `Processed: ${url}`, timestamp: Date.now() };
  };
}

// Test input validation
test('BatchProcessor input validation', async (t) => {
  await t.test('validates constructor options', async () => {
    // Valid options
    assert.doesNotThrow(() => new BatchProcessor({
      concurrency: 5,
      delayMs: 100,
      timeout: 5000
    }));
    
    // Invalid options
    assert.throws(() => new BatchProcessor({
      concurrency: -1
    }), /Number must be greater than or equal to 1/);
    
    assert.throws(() => new BatchProcessor({
      concurrency: 101
    }), /Number must be less than or equal to 100/);
    
    assert.throws(() => new BatchProcessor({
      timeout: 50
    }), /Number must be greater than or equal to 100/);
    
    assert.throws(() => new BatchProcessor({
      unknownOption: true
    }), /Unrecognized key/);
  });
  
  await t.test('validates processBatch inputs', async () => {
    const processor = new BatchProcessor();
    
    // Invalid URLs array
    await assert.rejects(
      () => processor.processBatch(null, () => {}),
      /Expected array/
    );
    
    await assert.rejects(
      () => processor.processBatch([], () => {}),
      /Array must contain at least 1/
    );
    
    await assert.rejects(
      () => processor.processBatch(Array(10001).fill('http://example.com'), () => {}),
      /Array must contain at most 10000/
    );
    
    // Invalid processor function
    await assert.rejects(
      () => processor.processBatch(['http://example.com'], null),
      /Processor must be a function/
    );
  });
  
  await t.test('validates configuration consistency', async () => {
    assert.throws(() => new BatchProcessor({
      timeout: 100,
      delayMs: 200
    }), /Timeout must be greater than delay/);
  });
});

// Test URL validation and normalization
test('URL validation and normalization', async (t) => {
  const processor = new BatchProcessor();
  
  await t.test('validates URLs correctly', () => {
    // Valid URLs
    assert.deepStrictEqual(
      processor.validateUrl('https://example.com'),
      {
        isValid: true,
        normalized: 'https://example.com/',
        category: 'valid'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('http://example.com:8080/path?query=1'),
      {
        isValid: true,
        normalized: 'http://example.com:8080/path?query=1',
        category: 'valid'
      }
    );
    
    // Invalid URLs
    assert.deepStrictEqual(
      processor.validateUrl(''),
      {
        isValid: false,
        category: 'malformed',
        error: 'URL must be a non-empty string'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('not-a-url'),
      {
        isValid: false,
        category: 'malformed',
        error: 'Invalid URL'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('ftp://example.com'),
      {
        isValid: false,
        category: 'invalid_protocol',
        error: 'Invalid protocol: ftp:'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('http://localhost'),
      {
        isValid: false,
        category: 'private_host',
        error: 'Private/localhost URLs are not allowed'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('http://192.168.1.1'),
      {
        isValid: false,
        category: 'private_host',
        error: 'Private/localhost URLs are not allowed'
      }
    );
    
    assert.deepStrictEqual(
      processor.validateUrl('http://' + 'a'.repeat(2048)),
      {
        isValid: false,
        category: 'too_long',
        error: 'URL exceeds maximum length of 2048 characters'
      }
    );
  });
  
  await t.test('normalizes URLs correctly', () => {
    const url1 = new URL('https://example.com/path#fragment');
    assert.strictEqual(
      processor.normalizeUrl(url1),
      'https://example.com/path'
    );
    
    const url2 = new URL('https://example.com?utm_source=test&real_param=value&utm_campaign=test');
    assert.strictEqual(
      processor.normalizeUrl(url2),
      'https://example.com/?real_param=value'
    );
    
    const url3 = new URL('HTTP://EXAMPLE.COM:443/');
    assert.strictEqual(
      processor.normalizeUrl(url3),
      'http://example.com:443/'
    );
    
    const url4 = new URL('https://example.com:443/');
    assert.strictEqual(
      processor.normalizeUrl(url4),
      'https://example.com/'
    );
  });
});

// Test deduplication
test('URL deduplication', async (t) => {
  const processor = new BatchProcessor();
  
  const urls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page1',  // Exact duplicate
    'https://example.com/page1?utm_source=test',  // Normalized duplicate
    'https://example.com/page3',
    'invalid-url',
    'https://example.com/page2#section'  // Normalized duplicate
  ];
  
  const result = await processor.validateAndDeduplicate(urls);
  
  assert.strictEqual(result.validUrls.length, 3);
  assert.strictEqual(result.duplicates.length, 3);  // 2 exact + 1 normalized duplicate
  assert.strictEqual(result.invalidUrls.length, 1);
  
  // Check order preservation
  assert.strictEqual(result.validUrls[0].url, 'https://example.com/page1');
  assert.strictEqual(result.validUrls[1].url, 'https://example.com/page2');
  assert.strictEqual(result.validUrls[2].url, 'https://example.com/page3');
  
  // Check duplicate detection
  assert.strictEqual(result.duplicates[0].reason, 'duplicate_url');
  assert.strictEqual(result.duplicates[0].firstOccurrenceIndex, 0);  // First duplicate points to page1
  assert.strictEqual(result.duplicates[1].firstOccurrenceIndex, 0);  // Second duplicate also points to page1
  assert.strictEqual(result.duplicates[2].firstOccurrenceIndex, 1);  // Third duplicate points to page2
});

// Test basic processing
test('Basic batch processing', async (t) => {
  await t.test('processes URLs successfully', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 2,
      delayMs: 0
    });
    
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3'
    ];
    
    const mockProcessor = createMockProcessor();
    const result = await processor.processBatch(urls, mockProcessor);
    
    assert.strictEqual(result.state, BATCH_STATES.COMPLETED);
    assert.strictEqual(result.stats.totalUrls, 3);
    assert.strictEqual(result.stats.successfulUrls, 3);
    assert.strictEqual(result.stats.failedUrls, 0);
    assert.ok(result.stats.processingTime > 0);
    assert.ok(result.stats.averageProcessingTime > 0);
    assert.ok(result.stats.throughput > 0);
  });
  
  await t.test('handles mixed success and failure', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 2,
      delayMs: 0
    });
    
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
      'https://example.com/4',
      'https://example.com/5'
    ];
    
    const mockProcessor = createMockProcessor({ 
      failureRate: 0.4,
      errorType: 'network'
    });
    
    const result = await processor.processBatch(urls, mockProcessor);
    
    assert.strictEqual(result.state, BATCH_STATES.COMPLETED);
    assert.strictEqual(result.stats.totalUrls, 5);
    assert.strictEqual(result.stats.processedUrls, 5);
    assert.ok(result.stats.successfulUrls > 0);
    assert.ok(result.stats.failedUrls > 0);
    assert.strictEqual(result.stats.successfulUrls + result.stats.failedUrls, 5);
  });
});

// Test error categorization and reporting
test('Error categorization and reporting', async (t) => {
  await t.test('categorizes errors correctly', async () => {
    const processor = new BatchProcessor();
    
    // Network error
    const networkError = new Error('Connection refused');
    networkError.code = 'ECONNREFUSED';
    assert.strictEqual(
      processor.categorizeError(networkError).category,
      ERROR_CATEGORIES.NETWORK
    );
    
    // Timeout error
    const timeoutError = new Error('Request timeout');
    timeoutError.code = 'ETIMEDOUT';
    assert.strictEqual(
      processor.categorizeError(timeoutError).category,
      ERROR_CATEGORIES.TIMEOUT
    );
    
    // Rate limit error
    const rateLimitError = new Error('Too many requests');
    rateLimitError.status = 429;
    assert.strictEqual(
      processor.categorizeError(rateLimitError).category,
      ERROR_CATEGORIES.RATE_LIMIT
    );
    
    // Server error
    const serverError = new Error('Internal server error');
    serverError.status = 500;
    assert.strictEqual(
      processor.categorizeError(serverError).category,
      ERROR_CATEGORIES.SERVER_ERROR
    );
    
    // Client error
    const clientError = new Error('Not found');
    clientError.status = 404;
    assert.strictEqual(
      processor.categorizeError(clientError).category,
      ERROR_CATEGORIES.CLIENT_ERROR
    );
    
    // Parsing error
    const parseError = new Error('Failed to parse JSON response');
    assert.strictEqual(
      processor.categorizeError(parseError).category,
      ERROR_CATEGORIES.PARSING
    );
    
    // Unknown error
    const unknownError = new Error('Something went wrong');
    assert.strictEqual(
      processor.categorizeError(unknownError).category,
      ERROR_CATEGORIES.UNKNOWN
    );
  });
  
  await t.test('generates error report with patterns', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 2,
      delayMs: 0,
      errorReportSize: 10
    });
    
    // Create processor that fails with specific patterns
    let callCount = 0;
    const failingProcessor = async (url) => {
      callCount++;
      if (callCount <= 5) {
        const error = new Error('Connection timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      } else if (callCount <= 8) {
        const error = new Error('Rate limited');
        error.status = 429;
        throw error;
      } else {
        const error = new Error('Server error');
        error.status = 500;
        throw error;
      }
    };
    
    const urls = Array(10).fill(null).map((_, i) => `https://example.com/${i}`);
    const result = await processor.processBatch(urls, failingProcessor);
    
    assert.ok(result.errorReport);
    assert.ok(result.errorReport.patterns.length > 0);
    assert.ok(result.errorReport.recommendations.length > 0);
    
    // Check recommendations
    const timeoutRec = result.errorReport.recommendations.find(r => r.type === 'timeout');
    assert.ok(timeoutRec);
    assert.strictEqual(timeoutRec.severity, 'high');
  });
});

// Test concurrency control
test('Concurrency control', async (t) => {
  await t.test('respects concurrency limit', async () => {
    const concurrency = 3;
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
    
    const urls = Array(10).fill(null).map((_, i) => `https://example.com/${i}`);
    await processor.processBatch(urls, trackingProcessor);
    
    assert.ok(maxConcurrent <= concurrency, `Max concurrent (${maxConcurrent}) should not exceed limit (${concurrency})`);
  });
});

// Test pause/resume/stop functionality
test('Batch control functions', async (t) => {
  await t.test('can pause and resume processing', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 1,
      delayMs: 0
    });
    
    let processedCount = 0;
    const pauseProcessor = async (url) => {
      processedCount++;
      if (processedCount === 2) {
        processor.pause();
        // Resume after a delay
        setTimeout(() => processor.resume(), 100);
      }
      await timers.setTimeout(10);
      return { url };
    };
    
    const urls = Array(5).fill(null).map((_, i) => `https://example.com/${i}`);
    const startTime = Date.now();
    const result = await processor.processBatch(urls, pauseProcessor);
    const duration = Date.now() - startTime;
    
    assert.strictEqual(result.stats.successfulUrls, 5);
    assert.ok(duration >= 100, 'Processing should have been paused');
  });
  
  await t.test('can stop processing', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 1,
      delayMs: 0
    });
    
    let processedCount = 0;
    const stopProcessor = async (url) => {
      processedCount++;
      if (processedCount === 2) {
        processor.stop();
      }
      await timers.setTimeout(10);
      return { url };
    };
    
    const urls = Array(5).fill(null).map((_, i) => `https://example.com/${i}`);
    const result = await processor.processBatch(urls, stopProcessor);
    
    assert.strictEqual(result.state, BATCH_STATES.STOPPED);
    assert.ok(result.stats.processedUrls < 5, 'Should not process all URLs');
  });
});

// Test progress reporting
test('Progress reporting', async (t) => {
  await t.test('reports progress correctly', async () => {
    const progressReports = [];
    
    const processor = new BatchProcessor({ 
      concurrency: 2,
      delayMs: 0,
      onProgress: (progress) => {
        progressReports.push({ ...progress });
      }
    });
    
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3'
    ];
    
    await processor.processBatch(urls, createMockProcessor());
    
    // Should have validation and processing progress reports
    const validationReport = progressReports.find(r => r.phase === 'validation');
    assert.ok(validationReport);
    assert.strictEqual(validationReport.valid, 3);
    
    const processingReports = progressReports.filter(r => r.phase === 'processing');
    assert.ok(processingReports.length > 0);
    
    const lastReport = processingReports[processingReports.length - 1];
    assert.strictEqual(lastReport.completed, 3);
    assert.strictEqual(lastReport.percentage, 100);
  });
});

// Test memory management
test('Memory management', async (t) => {
  await t.test('limits error storage', async () => {
    const errorReportSize = 20;
    const processor = new BatchProcessor({ 
      concurrency: 5,
      delayMs: 0,
      errorReportSize
    });
    
    // Process many failing URLs
    const urls = Array(100).fill(null).map((_, i) => `https://example.com/${i}`);
    const failingProcessor = createMockProcessor({ failureRate: 1 });
    
    const result = await processor.processBatch(urls, failingProcessor);
    
    assert.ok(result.errorReport.detailedErrors.length <= errorReportSize);
  });
  
  await t.test('limits error pattern tracking', async () => {
    const processor = new BatchProcessor({ 
      concurrency: 5,
      delayMs: 0
    });
    
    // Create processor that generates many different error patterns
    const diverseErrorProcessor = async (url) => {
      const error = new Error(`Unique error ${Math.random()}`);
      error.code = `ERROR_${Math.floor(Math.random() * 200)}`;
      throw error;
    };
    
    const urls = Array(200).fill(null).map((_, i) => `https://example.com/${i}`);
    const result = await processor.processBatch(urls, diverseErrorProcessor);
    
    // Error patterns should be limited
    assert.ok(processor.errorPatterns.size <= 100);
  });
});

// Test edge cases
test('Edge cases', async (t) => {
  await t.test('handles empty results from processor', async () => {
    const processor = new BatchProcessor();
    
    const emptyProcessor = async () => {
      return null;
    };
    
    const urls = ['https://example.com'];
    const result = await processor.processBatch(urls, emptyProcessor);
    
    assert.strictEqual(result.stats.successfulUrls, 1);
    assert.strictEqual(result.results[0].result, null);
  });
  
  await t.test('handles processor that returns undefined', async () => {
    const processor = new BatchProcessor();
    
    const undefinedProcessor = async () => {
      // Returns undefined implicitly
    };
    
    const urls = ['https://example.com'];
    const result = await processor.processBatch(urls, undefinedProcessor);
    
    assert.strictEqual(result.stats.successfulUrls, 1);
    assert.strictEqual(result.results[0].result, undefined);
  });
  
  await t.test('handles very long URLs in errors', async () => {
    const processor = new BatchProcessor();
    
    const longUrl = 'https://example.com/' + 'a'.repeat(1000);
    const failingProcessor = async () => {
      throw new Error('Failed to process');
    };
    
    const result = await processor.processBatch([longUrl], failingProcessor);
    
    assert.strictEqual(result.stats.failedUrls, 1);
    // URL should be truncated in error report
    assert.ok(result.errorReport.detailedErrors[0].url.length <= 500);
  });
  
  await t.test('handles processor exceptions during state changes', async () => {
    const processor = new BatchProcessor();
    
    let shouldFail = true;
    const unstableProcessor = async (url) => {
      if (shouldFail) {
        shouldFail = false;
        // Try to break things by manipulating state
        processor.state = 'invalid_state';
        throw new Error('State manipulation');
      }
      return { url };
    };
    
    const urls = ['https://example.com/1', 'https://example.com/2'];
    const result = await processor.processBatch(urls, unstableProcessor);
    
    // Should still complete processing
    assert.ok(result.stats.processedUrls > 0);
  });
});

// Test state management
test('State management', async (t) => {
  await t.test('prevents concurrent batch processing', async () => {
    const processor = new BatchProcessor();
    
    const slowProcessor = async () => {
      await timers.setTimeout(100);
      return { data: 'ok' };
    };
    
    const urls = ['https://example.com'];
    
    // Start first batch
    const promise1 = processor.processBatch(urls, slowProcessor);
    
    // Try to start second batch immediately
    await assert.rejects(
      () => processor.processBatch(urls, slowProcessor),
      /Cannot start new batch while in/
    );
    
    // Wait for first batch to complete
    await promise1;
    
    // Now should be able to start new batch
    await assert.doesNotReject(
      () => processor.processBatch(urls, slowProcessor)
    );
  });
  
  await t.test('resets state between batches', async () => {
    const processor = new BatchProcessor();
    
    // First batch with errors
    const failingProcessor = createMockProcessor({ failureRate: 1 });
    const result1 = await processor.processBatch(
      ['https://example.com/1'],
      failingProcessor
    );
    
    assert.strictEqual(result1.stats.failedUrls, 1);
    
    // Second batch should start fresh
    const successProcessor = createMockProcessor();
    const result2 = await processor.processBatch(
      ['https://example.com/2'],
      successProcessor
    );
    
    assert.strictEqual(result2.stats.successfulUrls, 1);
    assert.strictEqual(result2.stats.failedUrls, 0);
    assert.strictEqual(result2.errorReport.totalErrors, 0);
  });
});

// Test callback error boundaries
test('Callback error boundaries', async (t) => {
  await t.test('handles errors in progress callback', async () => {
    const processor = new BatchProcessor({
      onProgress: () => {
        throw new Error('Progress callback error');
      }
    });
    
    // Should not throw despite callback error
    await assert.doesNotReject(
      () => processor.processBatch(['https://example.com'], createMockProcessor())
    );
  });
  
  await t.test('handles errors in error callback', async () => {
    const processor = new BatchProcessor({
      onError: () => {
        throw new Error('Error callback error');
      }
    });
    
    const failingProcessor = async () => {
      throw new Error('Processing failed');
    };
    
    // Should handle both processing error and callback error
    await assert.rejects(
      () => processor.processBatch(['https://example.com'], failingProcessor),
      /Processing failed/
    );
  });
  
  await t.test('handles errors in complete callback', async () => {
    const processor = new BatchProcessor({
      onComplete: () => {
        throw new Error('Complete callback error');
      }
    });
    
    // Should not throw despite callback error
    await assert.doesNotReject(
      () => processor.processBatch(['https://example.com'], createMockProcessor())
    );
  });
});

// Test recommendations generation
test('Recommendations generation', async (t) => {
  await t.test('generates appropriate recommendations', async () => {
    const processor = new BatchProcessor({
      concurrency: 5,
      delayMs: 100,
      timeout: 1000
    });
    
    // Create specific error scenarios
    const urls = Array(20).fill(null).map((_, i) => `https://example.com/${i}`);
    
    let callCount = 0;
    const scenarioProcessor = async () => {
      callCount++;
      
      if (callCount <= 5) {
        // Timeout errors
        const error = new Error('Operation timed out');
        error.code = 'ETIMEDOUT';
        throw error;
      } else if (callCount <= 8) {
        // Rate limit errors
        const error = new Error('Rate limited');
        error.status = 429;
        throw error;
      } else if (callCount <= 12) {
        // Network errors
        const error = new Error('Network error');
        error.code = 'ECONNREFUSED';
        throw error;
      } else {
        return { success: true };
      }
    };
    
    const result = await processor.processBatch(urls, scenarioProcessor);
    const recommendations = result.errorReport.recommendations;
    
    // Should have timeout recommendation
    const timeoutRec = recommendations.find(r => r.type === 'timeout');
    assert.ok(timeoutRec);
    assert.ok(timeoutRec.config.timeout > processor.options.timeout);
    
    // Should have rate limit recommendation
    const rateLimitRec = recommendations.find(r => r.type === 'rate_limit');
    assert.ok(rateLimitRec);
    assert.ok(rateLimitRec.config.delayMs > processor.options.delayMs);
    
    // Should have network recommendation
    const networkRec = recommendations.find(r => r.type === 'network');
    assert.ok(networkRec);
  });
});

// Test large batch handling
test('Large batch handling', async (t) => {
  await t.test('handles large URL batches efficiently', async () => {
    const processor = new BatchProcessor({
      concurrency: 10,
      delayMs: 0
    });
    
    // Create a large batch
    const urls = Array(1000).fill(null).map((_, i) => `https://example.com/page${i}`);
    
    const fastProcessor = async (url) => {
      // Minimal processing
      return { url, processed: true };
    };
    
    const startTime = Date.now();
    const result = await processor.processBatch(urls, fastProcessor);
    const duration = Date.now() - startTime;
    
    assert.strictEqual(result.stats.successfulUrls, 1000);
    assert.ok(result.stats.throughput > 10, 'Should process at reasonable throughput');
    
    // Should complete in reasonable time with concurrency
    assert.ok(duration < 5000, `Should complete quickly, took ${duration}ms`);
  });
});