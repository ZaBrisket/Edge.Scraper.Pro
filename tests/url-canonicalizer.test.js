/**
 * Unit tests for URL Canonicalizer
 */

const { test, describe, mock } = require('node:test');
const assert = require('node:assert');
const { UrlCanonicalizer } = require('../src/lib/http/url-canonicalizer');

describe('UrlCanonicalizer', () => {
  describe('generateUrlVariants', () => {
    test('should generate HTTPS upgrade variants', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://example.com/path');
      
      assert(variants.includes('https://example.com/path'));
      assert(variants.includes('https://www.example.com/path'));
    });

    test('should generate www variants', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://example.com/path');
      
      assert(variants.includes('https://www.example.com/path'));
    });

    test('should generate trailing slash variants', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://example.com/path');
      
      assert(variants.includes('https://example.com/path/'));
      assert(variants.includes('https://www.example.com/path/'));
    });

    test('should generate apex domain variants for www URLs', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://www.example.com/path');
      
      assert(variants.includes('http://example.com/path'));
      assert(variants.includes('https://example.com/path'));
    });

    test('should preserve query parameters and fragments', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://example.com/path?query=1#fragment');
      
      assert(variants.some(v => v.includes('?query=1#fragment')));
    });

    test('should not include original URL in variants', () => {
      const canonicalizer = new UrlCanonicalizer();
      const originalUrl = 'http://example.com/path';
      const variants = canonicalizer.generateUrlVariants(originalUrl);
      
      assert(!variants.includes(originalUrl));
    });

    test('should handle root path correctly', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('http://example.com/');
      
      // Root path should not get double slash
      assert(variants.every(v => !v.includes('//')));
    });

    test('should return empty array for invalid URLs', () => {
      const canonicalizer = new UrlCanonicalizer();
      const variants = canonicalizer.generateUrlVariants('not-a-url');
      
      assert.strictEqual(variants.length, 0);
    });
  });

  describe('preflightCheck', () => {
    test('should perform HEAD request first', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async (url, options) => {
        if (options.method === 'HEAD') {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name) => ({
                'cache-control': 'max-age=3600',
                'server': 'nginx',
                'content-type': 'text/html'
              })[name]
            }
          };
        }
        throw new Error('Should use HEAD first');
      });

      const result = await canonicalizer.preflightCheck('https://example.com', mockFetch);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.method, 'HEAD');
      assert.strictEqual(mockFetch.mock.calls.length, 1);
    });

    test('should fallback to GET if HEAD fails', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async (url, options) => {
        if (options.method === 'HEAD') {
          throw new Error('HEAD not supported');
        }
        if (options.method === 'GET') {
          return {
            ok: true,
            status: 200,
            headers: {
              get: () => null
            }
          };
        }
        throw new Error('Unexpected method');
      });

      const result = await canonicalizer.preflightCheck('https://example.com', mockFetch);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.method, 'GET');
      assert.strictEqual(mockFetch.mock.calls.length, 2);
    });

    test('should handle redirects manually', async () => {
      const canonicalizer = new UrlCanonicalizer();
      let callCount = 0;
      const mockFetch = mock.fn(async (url, options) => {
        callCount++;
        if (callCount === 1) {
          return {
            status: 301,
            headers: {
              get: (name) => name === 'location' ? 'https://www.example.com/' : null
            }
          };
        }
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => null
          }
        };
      });

      const result = await canonicalizer.preflightCheck('https://example.com', mockFetch);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.finalUrl, 'https://www.example.com/');
      assert.strictEqual(result.redirectChain.length, 1);
      assert.strictEqual(result.redirectChain[0].from, 'https://example.com');
      assert.strictEqual(result.redirectChain[0].to, 'https://www.example.com/');
    });

    test('should limit redirect depth', async () => {
      const canonicalizer = new UrlCanonicalizer({ maxRedirects: 2 });
      let callCount = 0;
      const mockFetch = mock.fn(async (url, options) => {
        callCount++;
        return {
          status: 301,
          headers: {
            get: (name) => name === 'location' ? `https://example${callCount}.com/` : null
          }
        };
      });

      const result = await canonicalizer.preflightCheck('https://example.com', mockFetch);
      
      assert.strictEqual(result.redirectChain.length, 2);
      assert.strictEqual(mockFetch.mock.calls.length, 3); // Original + 2 redirects
    });

    test('should handle fetch errors gracefully', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async () => {
        throw new Error('Network error');
      });

      const result = await canonicalizer.preflightCheck('https://example.com', mockFetch);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Network error');
    });
  });

  describe('canonicalizeUrl', () => {
    test('should try variants in order until success', async () => {
      const canonicalizer = new UrlCanonicalizer();
      let attemptCount = 0;
      const mockFetch = mock.fn(async (url, options) => {
        attemptCount++;
        if (url.includes('https://www.')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null }
          };
        }
        return {
          ok: false,
          status: 404,
          headers: { get: () => null }
        };
      });

      const result = await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      
      assert.strictEqual(result.success, true);
      assert(result.canonicalUrl.includes('https://www.example.com/path'));
      assert(result.attempts.length > 1);
    });

    test('should cache successful canonicalizations', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null }
      }));

      // First call
      await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      const firstCallCount = mockFetch.mock.calls.length;

      // Second call should use cache
      await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      
      assert.strictEqual(mockFetch.mock.calls.length, firstCallCount);
    });

    test('should return failure when all variants fail', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null }
      }));

      const result = await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      
      assert.strictEqual(result.success, false);
      assert(result.error.includes('All'));
      assert(result.attempts.length > 0);
    });

    test('should apply backoff delays between attempts', async () => {
      const canonicalizer = new UrlCanonicalizer({
        backoffDelays: [100, 200, 300]
      });
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null }
      }));

      const startTime = Date.now();
      await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      const elapsed = Date.now() - startTime;
      
      // Should have applied at least some delay
      assert(elapsed >= 100);
    });
  });

  describe('cache management', () => {
    test('should clean up expired cache entries', async () => {
      const canonicalizer = new UrlCanonicalizer({
        cacheMaxAge: 100 // 100ms for testing
      });
      const mockFetch = mock.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null }
      }));

      // Add entry to cache
      await canonicalizer.canonicalizeUrl('http://example.com/path', mockFetch);
      assert.strictEqual(canonicalizer.getStats().cacheSize, 1);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Trigger cleanup
      canonicalizer.cleanupCache();
      assert.strictEqual(canonicalizer.getStats().cacheSize, 0);
    });

    test('should clear all cache entries', async () => {
      const canonicalizer = new UrlCanonicalizer();
      const mockFetch = mock.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null }
      }));

      await canonicalizer.canonicalizeUrl('http://example1.com/path', mockFetch);
      await canonicalizer.canonicalizeUrl('http://example2.com/path', mockFetch);
      assert.strictEqual(canonicalizer.getStats().cacheSize, 2);

      canonicalizer.clearCache();
      assert.strictEqual(canonicalizer.getStats().cacheSize, 0);
    });
  });
});

// D2P Buyers Guide specific tests
describe('D2P Buyers Guide URL Canonicalization', () => {
  test('should generate correct variants for D2P URLs', () => {
    const canonicalizer = new UrlCanonicalizer();
    const originalUrl = 'http://www.d2pbuyersguide.com/filter/all/page/1';
    const variants = canonicalizer.generateUrlVariants(originalUrl);
    
    // Should include HTTPS upgrade
    assert(variants.includes('https://www.d2pbuyersguide.com/filter/all/page/1'));
    
    // Should include apex domain
    assert(variants.includes('https://d2pbuyersguide.com/filter/all/page/1'));
    
    // Should include trailing slash variants
    assert(variants.includes('https://www.d2pbuyersguide.com/filter/all/page/1/'));
  });

  test('should handle D2P page range URLs', () => {
    const canonicalizer = new UrlCanonicalizer();
    
    for (let page = 1; page <= 5; page++) {
      const url = `http://www.d2pbuyersguide.com/filter/all/page/${page}`;
      const variants = canonicalizer.generateUrlVariants(url);
      
      assert(variants.some(v => v.includes('https://')));
      assert(variants.some(v => v.includes(`/page/${page}`)));
    }
  });

  test('should handle D2P letter-indexed URLs', () => {
    const canonicalizer = new UrlCanonicalizer();
    const letters = ['a', 'b', 'o', 'x', 'p', 'i'];
    
    for (const letter of letters) {
      const url = `http://www.d2pbuyersguide.com/filter/${letter}/page/1`;
      const variants = canonicalizer.generateUrlVariants(url);
      
      assert(variants.some(v => v.includes('https://')));
      assert(variants.some(v => v.includes(`/filter/${letter}/`)));
    }
  });
});