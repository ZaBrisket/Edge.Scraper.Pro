/**
 * Simple Test Suite for Hardened Batch Processor
 * 
 * Basic functionality tests to verify core features work
 */

const test = require('node:test');
const assert = require('node:assert');

const { 
  HardenedBatchProcessor, 
  ERROR_CATEGORIES, 
  BATCH_STATES 
} = require('../src/lib/hardened-batch-processor');

// Set test environment
process.env.NODE_ENV = 'test';

// Test utilities
function createMockProcessor(successRate = 1.0) {
  return async (url, item, options = {}) => {
    if (Math.random() > successRate) {
      throw new Error(`Mock error for ${url}`);
    }
    return { url, processed: true, timestamp: new Date().toISOString() };
  };
}

test('creates processor instance correctly', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  assert.strictEqual(processor.state, BATCH_STATES.IDLE);
  assert.ok(processor.options);
  assert.ok(processor.metrics);
});

test('validates URLs correctly', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  const result = await processor.processBatch(['https://example.com'], createMockProcessor());
  
  assert.strictEqual(result.stats.validUrls, 1);
  assert.strictEqual(result.stats.invalidUrls, 0);
  assert.strictEqual(result.stats.successfulUrls, 1);
});

test('handles invalid URLs correctly', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  const result = await processor.processBatch(['invalid-url'], createMockProcessor());
  
  assert.strictEqual(result.stats.validUrls, 0);
  assert.strictEqual(result.stats.invalidUrls, 1);
  assert.strictEqual(result.stats.successfulUrls, 0);
});

test('handles processor errors gracefully', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  const failingProcessor = async (url, item, options = {}) => {
    throw new Error('Processing failed');
  };
  
  const result = await processor.processBatch(['https://example.com'], failingProcessor);
  
  assert.strictEqual(result.stats.successfulUrls, 0);
  assert.strictEqual(result.stats.failedUrls, 1);
  assert.ok(result.errorReport.totalErrors > 0);
});

test('provides health status', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  const health = processor.getHealthStatus();
  
  assert.ok(['healthy', 'processing'].includes(health.status));
  assert.ok(health.state);
  assert.ok(typeof health.activeWorkers === 'number');
});

test('handles empty batch gracefully', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  await assert.rejects(
    () => processor.processBatch([], createMockProcessor()),
    /URLs array cannot be empty/
  );
});

test('handles single URL batch', async (t) => {
  const processor = new HardenedBatchProcessor();
  
  const result = await processor.processBatch(['https://example.com'], createMockProcessor());
  
  assert.strictEqual(result.stats.totalUrls, 1);
  assert.strictEqual(result.stats.successfulUrls, 1);
  assert.strictEqual(result.stats.failedUrls, 0);
});

console.log('✅ Simple Batch Processor test suite loaded');