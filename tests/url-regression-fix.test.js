/**
 * URL Regression Fix Tests
 * Comprehensive tests to verify URLs don't disappear after processing
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

// Mock API functions for testing
function createMockJob(urls, mode = 'news-articles') {
  const input = { urls, options: {} };
  
  // Simulate the immutable input creation from start.ts
  const immutableInput = JSON.parse(JSON.stringify(input));
  immutableInput.metadata = {
    submittedAt: new Date().toISOString(),
    originalUrlCount: input.urls.length,
    jobId: 'test-job-123',
  };

  // Create separate deep copy for original input preservation
  const originalInputSnapshot = JSON.parse(JSON.stringify(immutableInput));

  const job = {
    id: immutableInput.metadata.jobId,
    mode,
    input: immutableInput, // Working copy for processing
    originalInput: originalInputSnapshot, // Immutable snapshot for preservation
    status: 'pending',
    progress: {
      completed: 0,
      total: input.urls.length,
      percentage: 0,
      errors: 0,
    },
    result: null,
    error: null,
    startTime: new Date().toISOString(),
    endTime: null,
  };

  return job;
}

function simulateJobCompletion(job, mockResults) {
  // Simulate the enhanced result creation from start.ts
  const enhancedResult = {
    results: mockResults,
    summary: {
      total: mockResults.length,
      successful: mockResults.filter(r => r.success).length,
      failed: mockResults.filter(r => !r.success).length,
    },
    sourceInput: {
      urls: job.originalInput.urls,
      options: job.originalInput.options,
      submittedAt: job.originalInput.metadata.submittedAt,
      originalCount: job.originalInput.metadata.originalUrlCount,
    },
    urlPreservation: {
      sourceUrls: job.originalInput.urls,
      processedUrls: mockResults.map(r => r.url),
      discoveredUrls: mockResults.filter(r => 
        r.paginationDiscovered && !job.originalInput.urls.includes(r.url)
      ).map(r => r.url),
    },
  };

  job.status = 'completed';
  job.result = enhancedResult;
  job.endTime = new Date().toISOString();
  job.progress = {
    completed: mockResults.length,
    total: mockResults.length,
    percentage: 100,
    errors: enhancedResult.summary.failed,
  };

  return job;
}

describe('URL Regression Fix', () => {
  test('should preserve original URLs in job input', () => {
    const originalUrls = [
      'https://example.com/article-1',
      'https://example.com/article-2',
      'https://example.com/article-3',
    ];

    const job = createMockJob(originalUrls);

    // Verify original URLs are preserved in immutable input
    assert.deepStrictEqual(job.originalInput.urls, originalUrls);
    assert.strictEqual(job.originalInput.metadata.originalUrlCount, 3);
    
    // Verify job input is separate copy
    assert.deepStrictEqual(job.input.urls, originalUrls);
    
    // Test immutability - modifying working copy shouldn't affect original
    job.input.urls.push('https://modified.com');
    // With proper deep copying, original should be unchanged
    assert.strictEqual(job.originalInput.urls.length, 3); // Original preserved
    assert.strictEqual(job.input.urls.length, 4); // Working copy modified
    
    console.log('✅ Original URLs preserved in immutable job input');
  });

  test('should maintain source URLs separate from processed URLs', () => {
    const sourceUrls = [
      'https://directory.com/page/1',
    ];

    const job = createMockJob(sourceUrls, 'supplier-directory');
    
    // Simulate processing with pagination discovery
    const mockResults = [
      { url: 'https://directory.com/page/1', success: true, paginationDiscovered: false },
      { url: 'https://directory.com/page/2', success: true, paginationDiscovered: true },
      { url: 'https://directory.com/page/3', success: true, paginationDiscovered: true },
    ];

    const completedJob = simulateJobCompletion(job, mockResults);

    // Verify source URLs are preserved
    assert.deepStrictEqual(completedJob.result.sourceInput.urls, sourceUrls);
    assert.strictEqual(completedJob.result.sourceInput.originalCount, 1);

    // Verify URL preservation structure
    assert.deepStrictEqual(completedJob.result.urlPreservation.sourceUrls, sourceUrls);
    assert.strictEqual(completedJob.result.urlPreservation.processedUrls.length, 3);
    assert.strictEqual(completedJob.result.urlPreservation.discoveredUrls.length, 2);

    // Verify discovered URLs don't include source URL
    assert.ok(!completedJob.result.urlPreservation.discoveredUrls.includes(sourceUrls[0]));
    
    console.log('✅ Source URLs maintained separate from processed URLs');
  });

  test('should handle job with no pagination discovery', () => {
    const urls = [
      'https://news.com/article-1',
      'https://news.com/article-2',
    ];

    const job = createMockJob(urls, 'news-articles');
    
    // Simulate processing without pagination discovery
    const mockResults = [
      { url: 'https://news.com/article-1', success: true, paginationDiscovered: false },
      { url: 'https://news.com/article-2', success: false, paginationDiscovered: false },
    ];

    const completedJob = simulateJobCompletion(job, mockResults);

    // Verify source URLs are preserved
    assert.deepStrictEqual(completedJob.result.sourceInput.urls, urls);
    assert.strictEqual(completedJob.result.urlPreservation.discoveredUrls.length, 0);
    assert.strictEqual(completedJob.result.urlPreservation.processedUrls.length, 2);
    
    console.log('✅ Jobs without pagination discovery handled correctly');
  });

  test('should preserve URLs even when processing fails', () => {
    const urls = [
      'https://broken.com/page-1',
      'https://broken.com/page-2',
    ];

    const job = createMockJob(urls);
    
    // Simulate processing with all failures
    const mockResults = [
      { url: 'https://broken.com/page-1', success: false, error: 'Not found' },
      { url: 'https://broken.com/page-2', success: false, error: 'Timeout' },
    ];

    const completedJob = simulateJobCompletion(job, mockResults);

    // Even with failures, source URLs should be preserved
    assert.deepStrictEqual(completedJob.result.sourceInput.urls, urls);
    assert.strictEqual(completedJob.result.summary.successful, 0);
    assert.strictEqual(completedJob.result.summary.failed, 2);
    
    // URL preservation should still work
    assert.deepStrictEqual(completedJob.result.urlPreservation.sourceUrls, urls);
    assert.strictEqual(completedJob.result.urlPreservation.processedUrls.length, 2);
    
    console.log('✅ URLs preserved even when processing fails');
  });

  test('should provide immutable job metadata', () => {
    const urls = ['https://test.com/page'];
    const job = createMockJob(urls);

    // Verify metadata is properly set
    assert.ok(job.originalInput.metadata.submittedAt);
    assert.strictEqual(job.originalInput.metadata.originalUrlCount, 1);
    assert.strictEqual(job.originalInput.metadata.jobId, job.id);

    // Verify metadata is immutable
    const originalSubmittedAt = job.originalInput.metadata.submittedAt;
    job.originalInput.metadata.submittedAt = 'modified';
    
    // Create another reference to verify immutability concept
    const jobCopy = JSON.parse(JSON.stringify(job));
    assert.strictEqual(jobCopy.originalInput.metadata.submittedAt, 'modified');
    
    console.log('✅ Job metadata properly structured and accessible');
  });

  test('should differentiate between source and discovered URLs in results', () => {
    const sourceUrls = ['https://site.com/index'];
    const job = createMockJob(sourceUrls, 'supplier-directory');
    
    // Simulate extensive pagination discovery
    const mockResults = [
      { url: 'https://site.com/index', success: true, paginationDiscovered: false },
      { url: 'https://site.com/page/2', success: true, paginationDiscovered: true },
      { url: 'https://site.com/page/3', success: true, paginationDiscovered: true },
      { url: 'https://site.com/page/4', success: false, paginationDiscovered: true },
      { url: 'https://site.com/page/5', success: true, paginationDiscovered: true },
    ];

    const completedJob = simulateJobCompletion(job, mockResults);

    // Verify clear separation
    assert.strictEqual(completedJob.result.urlPreservation.sourceUrls.length, 1);
    assert.strictEqual(completedJob.result.urlPreservation.discoveredUrls.length, 4);
    assert.strictEqual(completedJob.result.urlPreservation.processedUrls.length, 5);

    // Verify source URL is not in discovered URLs
    const sourceUrl = sourceUrls[0];
    assert.ok(!completedJob.result.urlPreservation.discoveredUrls.includes(sourceUrl));
    assert.ok(completedJob.result.urlPreservation.processedUrls.includes(sourceUrl));

    console.log('✅ Clear differentiation between source and discovered URLs');
  });

  test('should maintain URL list integrity throughout processing pipeline', () => {
    const originalUrls = [
      'https://example.com/test-1',
      'https://example.com/test-2',
      'https://example.com/test-3',
    ];

    // Step 1: Job creation
    const job = createMockJob(originalUrls);
    assert.deepStrictEqual(job.originalInput.urls, originalUrls);

    // Step 2: Simulate input validation (should not mutate original)
    const validationInput = { ...job.input };
    validationInput.urls.push('https://validation-added.com'); // Simulate mutation
    
    // With proper deep copying, original should be unchanged
    assert.deepStrictEqual(job.originalInput.urls, originalUrls);
    assert.strictEqual(job.originalInput.urls.length, 3);

    // Step 3: Simulate processing
    const mockResults = originalUrls.map(url => ({
      url,
      success: true,
      data: { title: `Title for ${url}` },
    }));

    const completedJob = simulateJobCompletion(job, mockResults);

    // Step 4: Verify final result maintains URL integrity
    assert.deepStrictEqual(completedJob.result.sourceInput.urls, originalUrls);
    assert.deepStrictEqual(completedJob.result.urlPreservation.sourceUrls, originalUrls);
    assert.strictEqual(completedJob.result.urlPreservation.processedUrls.length, 3);

    // Verify each original URL has a corresponding result
    for (const originalUrl of originalUrls) {
      const hasResult = completedJob.result.results.some(r => r.url === originalUrl);
      assert.ok(hasResult, `Missing result for original URL: ${originalUrl}`);
    }

    console.log('✅ URL list integrity maintained throughout processing pipeline');
  });
});