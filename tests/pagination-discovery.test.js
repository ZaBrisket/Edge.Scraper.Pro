const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { PaginationDiscovery } = require('../src/lib/http/pagination-discovery');

describe('PaginationDiscovery', () => {
  let discovery;
  
  beforeEach(() => {
    discovery = new PaginationDiscovery({
      timeout: 1000,
      maxPages: 10,
      consecutive404Threshold: 3
    });
    nock.cleanAll();
  });
  
  afterEach(() => {
    nock.cleanAll();
  });

  test('should extract page number from URL correctly', () => {
    assert.strictEqual(discovery.extractPageNumber('https://example.com/page/5'), 5);
    assert.strictEqual(discovery.extractPageNumber('https://example.com/p/3'), 3);
    assert.strictEqual(discovery.extractPageNumber('https://example.com/page-2'), 2);
    assert.strictEqual(discovery.extractPageNumber('https://example.com?page=4'), 4);
    assert.strictEqual(discovery.extractPageNumber('https://example.com?p=6'), 6);
    assert.strictEqual(discovery.extractPageNumber('https://example.com/no-page'), null);
  });

  test('should generate page URL correctly', () => {
    const baseUrl = 'https://example.com/filter/all/page/1';
    const pageUrl = discovery.generatePageUrl(baseUrl, 5);
    
    assert.ok(pageUrl.includes('/page/5'));
    assert.ok(pageUrl.startsWith('https://'));
  });

  test('should generate letter URL correctly', () => {
    const baseUrl = 'https://example.com/filter/all/page/1';
    const letterUrl = discovery.generateLetterUrl(baseUrl, 'a', 2);
    
    assert.ok(letterUrl.includes('/filter/a/'));
    assert.ok(letterUrl.includes('/page/2'));
  });

  test('should parse pagination from HTML correctly', () => {
    const html = `
      <html>
        <body>
          <nav class="pagination">
            <a href="/page/1" class="current">1</a>
            <a href="/page/2">2</a>
            <a href="/page/3" rel="next">Next</a>
          </nav>
        </body>
      </html>
    `;
    
    const result = discovery.parsePagination(html, 'https://example.com');
    
    assert.ok(result.hasNext);
    assert.strictEqual(result.currentPage, 1);
    assert.strictEqual(result.pageLinks.length, 3);
    assert.ok(result.nextUrl);
  });

  test('should handle pagination with aria-labels', () => {
    const html = `
      <html>
        <body>
          <nav class="pagination">
            <a href="/page/2" aria-label="Next page">Next</a>
            <a href="/page/1" aria-label="Previous page">Previous</a>
          </nav>
        </body>
      </html>
    `;
    
    const result = discovery.parsePagination(html, 'https://example.com');
    
    assert.ok(result.hasNext);
    assert.ok(result.hasPrevious);
    assert.ok(result.nextUrl);
    assert.ok(result.previousUrl);
  });

  test('should discover pagination successfully', async () => {
    const html = `
      <html>
        <body>
          <nav class="pagination">
            <a href="/page/1" class="current">1</a>
            <a href="/page/2">2</a>
            <a href="/page/3" rel="next">Next</a>
          </nav>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/filter/all/page/2')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const scope3 = nock('https://example.com')
      .head('/filter/all/page/3')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.ok(result.discoveredPages.length > 0);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
    assert.ok(scope3.isDone());
  });

  test('should fallback to letter discovery when no pagination found', async () => {
    const html = `
      <html>
        <body>
          <h1>No pagination here</h1>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/filter/a/page/1')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.ok(result.discoveredPages.length > 0);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should handle 404 responses gracefully', async () => {
    const scope = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(404);
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(!result.success);
    assert.ok(result.errors.length > 0);
    assert.ok(scope.isDone());
  });

  test('should stop after consecutive 404s', async () => {
    const html = `
      <html>
        <body>
          <h1>Page 1</h1>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/filter/all/page/2')
      .reply(404);
    
    const scope3 = nock('https://example.com')
      .head('/filter/all/page/3')
      .reply(404);
    
    const scope4 = nock('https://example.com')
      .head('/filter/all/page/4')
      .reply(404);
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.ok(result.discoveredPages.length >= 1);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
    assert.ok(scope3.isDone());
    assert.ok(scope4.isDone());
  });

  test('should batch discover pagination', async () => {
    const html = `
      <html>
        <body>
          <h1>Page 1</h1>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/filter/a/page/1')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const urls = ['https://example.com/filter/all/page/1'];
    const results = await discovery.discoverPaginationBatch(urls, '550e8400-e29b-41d4-a716-446655440000');
    
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].success);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should handle network errors gracefully', async () => {
    const scope = nock('https://example.com')
      .get('/filter/all/page/1')
      .replyWithError('Network error');
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(!result.success);
    assert.ok(result.errors.length > 0);
    assert.ok(scope.isDone());
  });

  test('should respect maxPages limit', async () => {
    const html = `
      <html>
        <body>
          <h1>Page 1</h1>
        </body>
      </html>
    `;
    
    const scope1 = nock('https://example.com')
      .get('/filter/all/page/1')
      .reply(200, html, { 'content-type': 'text/html' });
    
    // Mock successful responses for many pages
    for (let i = 2; i <= 15; i++) {
      nock('https://example.com')
        .head(`/filter/all/page/${i}`)
        .reply(200, '', { 'content-type': 'text/html' });
    }
    
    const result = await discovery.discoverPagination('https://example.com/filter/all/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.ok(result.discoveredPages.length <= discovery.options.maxPages);
    assert.ok(scope1.isDone());
  });
});