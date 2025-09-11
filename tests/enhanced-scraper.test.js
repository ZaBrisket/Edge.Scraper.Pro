const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { EnhancedScraper } = require('../src/lib/http/enhanced-scraper');

describe('EnhancedScraper', () => {
  let scraper;
  
  beforeEach(() => {
    scraper = new EnhancedScraper({
      jobId: 'test-job',
      enableCanonicalization: true,
      enablePaginationDiscovery: true,
      enableStructuredLogging: false, // Disable file logging for tests
      timeout: 1000
    });
    nock.cleanAll();
  });
  
  afterEach(() => {
    nock.cleanAll();
  });

  test('should scrape single URL successfully', async () => {
    const html = '<html><body><h1>Test Page</h1></body></html>';
    
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(result.success);
    assert.strictEqual(result.originalUrl, 'http://example.com/page/1');
    assert.strictEqual(result.finalUrl, 'https://example.com/page/1');
    assert.strictEqual(result.status, 200);
    assert.ok(result.content.includes('Test Page'));
    assert.ok(scope.isDone());
  });

  test('should canonicalize HTTP to HTTPS', async () => {
    const html = '<html><body><h1>Test Page</h1></body></html>';
    
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(result.success);
    assert.strictEqual(result.finalUrl, 'https://example.com/page/1');
    assert.ok(result.canonicalization.success);
    assert.ok(scope.isDone());
  });

  test('should discover pagination when enabled', async () => {
    const html = `
      <html>
        <body>
          <h1>Page 1</h1>
          <nav class="pagination">
            <a href="/page/2" rel="next">Next</a>
          </nav>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/page/2')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(result.success);
    assert.ok(result.pagination);
    assert.ok(result.pagination.success);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should handle 404 responses gracefully', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(404);
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(!result.success);
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.errorClass, 'http_404');
    assert.ok(scope.isDone());
  });

  test('should handle network errors gracefully', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .replyWithError('Network error');
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'network_error');
    assert.ok(scope.isDone());
  });

  test('should scrape multiple URLs', async () => {
    const html1 = '<html><body><h1>Page 1</h1></body></html>';
    const html2 = '<html><body><h1>Page 2</h1></body></html>';
    
    const scope1 = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html1, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/page/2')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/2')
      .reply(200, html2, { 'content-type': 'text/html' });
    
    const urls = ['http://example.com/page/1', 'http://example.com/page/2'];
    const results = await scraper.scrapeUrls(urls);
    
    assert.strictEqual(results.length, 2);
    assert.ok(results[0].success);
    assert.ok(results[1].success);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should scrape with pagination discovery', async () => {
    const html = `
      <html>
        <body>
          <h1>Page 1</h1>
          <nav class="pagination">
            <a href="/page/2" rel="next">Next</a>
          </nav>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .head('/filter/all/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/filter/all/page/2')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await scraper.scrapeWithPagination('http://example.com/filter/all/page/1');
    
    assert.ok(result.success);
    assert.ok(result.discoveredPages.length > 0);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should track session metrics', async () => {
    const html = '<html><body><h1>Test Page</h1></body></html>';
    
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    await scraper.scrapeUrl('http://example.com/page/1');
    
    const metrics = scraper.getSessionMetrics();
    
    assert.strictEqual(metrics.totalUrls, 1);
    assert.strictEqual(metrics.successfulUrls, 1);
    assert.strictEqual(metrics.failedUrls, 0);
    assert.ok(scope.isDone());
  });

  test('should handle invalid URLs gracefully', async () => {
    const result = await scraper.scrapeUrl('not-a-url');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'invalid_url');
  });

  test('should respect timeout settings', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .delayConnection(2000) // Delay longer than timeout
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await scraper.scrapeUrl('http://example.com/page/1');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'timeout');
    assert.ok(scope.isDone());
  });

  test('should export logs as NDJSON', () => {
    const logs = scraper.exportLogs();
    
    assert.ok(typeof logs === 'string');
    // Should be empty since we disabled file logging in tests
    assert.strictEqual(logs, '');
  });

  test('should reset session metrics', () => {
    scraper.resetSession();
    
    const metrics = scraper.getSessionMetrics();
    
    assert.strictEqual(metrics.totalUrls, 0);
    assert.strictEqual(metrics.successfulUrls, 0);
    assert.strictEqual(metrics.failedUrls, 0);
  });

  test('should handle batch scraping with mixed results', async () => {
    const html = '<html><body><h1>Test Page</h1></body></html>';
    
    const scope1 = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' })
      .get('/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/page/2')
      .reply(404);
    
    const urls = ['http://example.com/page/1', 'http://example.com/page/2'];
    const results = await scraper.scrapeUrls(urls);
    
    assert.strictEqual(results.length, 2);
    assert.ok(results[0].success);
    assert.ok(!results[1].success);
    assert.strictEqual(results[1].status, 404);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });
});