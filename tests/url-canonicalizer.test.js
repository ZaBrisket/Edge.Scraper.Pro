const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { URLCanonicalizer } = require('../src/lib/http/url-canonicalizer');

describe('URLCanonicalizer', () => {
  let canonicalizer;
  
  beforeEach(() => {
    canonicalizer = new URLCanonicalizer({
      timeout: 1000,
      maxVariants: 4
    });
    nock.cleanAll();
  });
  
  afterEach(() => {
    nock.cleanAll();
  });

  test('should generate URL variants correctly', () => {
    const variants = canonicalizer.generateVariants('http://example.com/page/1');
    
    assert.ok(Array.isArray(variants));
    assert.ok(variants.length > 0);
    assert.ok(variants.includes('https://example.com/page/1'));
    assert.ok(variants.includes('https://www.example.com/page/1'));
  });

  test('should handle HTTPS URLs without adding HTTP variants', () => {
    const variants = canonicalizer.generateVariants('https://example.com/page/1');
    
    assert.ok(variants.includes('https://example.com/page/1'));
    assert.ok(!variants.some(v => v.startsWith('http://')));
  });

  test('should handle www URLs correctly', () => {
    const variants = canonicalizer.generateVariants('http://www.example.com/page/1');
    
    assert.ok(variants.includes('https://www.example.com/page/1'));
    assert.ok(variants.includes('https://example.com/page/1'));
  });

  test('should handle trailing slash variants', () => {
    const variants = canonicalizer.generateVariants('http://example.com/page');
    
    assert.ok(variants.some(v => v.endsWith('/page/')));
    assert.ok(variants.some(v => v.endsWith('/page')));
  });

  test('should canonicalize HTTP to HTTPS successfully', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await canonicalizer.canonicalize('http://example.com/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.strictEqual(result.canonicalUrl, 'https://example.com/page/1');
    assert.strictEqual(result.status, 200);
    assert.ok(scope.isDone());
  });

  test('should handle 404 responses gracefully', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .reply(404);
    
    const result = await canonicalizer.canonicalize('http://example.com/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'http_404');
    assert.ok(scope.isDone());
  });

  test('should try multiple variants on failure', async () => {
    const scope1 = nock('https://example.com')
      .head('/page/1')
      .reply(404);
    
    const scope2 = nock('https://www.example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const result = await canonicalizer.canonicalize('http://example.com/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(result.success);
    assert.strictEqual(result.canonicalUrl, 'https://www.example.com/page/1');
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should classify errors correctly', () => {
    const error1 = { meta: { status: 404 } };
    const error2 = { code: 'ENOTFOUND' };
    const error3 = { name: 'AbortError' };
    const error4 = { message: 'robots.txt blocked' };
    
    assert.strictEqual(canonicalizer.classifyError(error1), 'http_404');
    assert.strictEqual(canonicalizer.classifyError(error2), 'dns_error');
    assert.strictEqual(canonicalizer.classifyError(error3), 'timeout');
    assert.strictEqual(canonicalizer.classifyError(error4), 'blocked_by_robots');
  });

  test('should handle invalid URLs gracefully', async () => {
    const result = await canonicalizer.canonicalize('not-a-url', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'invalid_url');
  });

  test('should batch canonicalize URLs', async () => {
    const scope1 = nock('https://example.com')
      .head('/page/1')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const scope2 = nock('https://example.com')
      .head('/page/2')
      .reply(200, '', { 'content-type': 'text/html' });
    
    const urls = ['http://example.com/page/1', 'http://example.com/page/2'];
    const results = await canonicalizer.canonicalizeBatch(urls, '550e8400-e29b-41d4-a716-446655440000');
    
    assert.strictEqual(results.length, 2);
    assert.ok(results[0].success);
    assert.ok(results[1].success);
    assert.ok(scope1.isDone());
    assert.ok(scope2.isDone());
  });

  test('should respect maxVariants limit', () => {
    const variants = canonicalizer.generateVariants('http://example.com/page/1');
    
    assert.ok(variants.length <= canonicalizer.options.maxVariants);
  });

  test('should handle network errors gracefully', async () => {
    const scope = nock('https://example.com')
      .head('/page/1')
      .replyWithError('Network error');
    
    const result = await canonicalizer.canonicalize('http://example.com/page/1', '550e8400-e29b-41d4-a716-446655440000');
    
    assert.ok(!result.success);
    assert.strictEqual(result.errorClass, 'network_error');
    assert.ok(scope.isDone());
  });
});