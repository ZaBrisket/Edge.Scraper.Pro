const { UrlNormalizer } = require('../src/pipeline/url-normalizer');
const nock = require('nock');

describe('URL Normalizer', () => {
  let normalizer;
  let mockFetchClient;

  beforeEach(() => {
    normalizer = new UrlNormalizer();
    mockFetchClient = jest.fn();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('URL Canonicalization', () => {
    it('should upgrade HTTP to HTTPS', async () => {
      const testUrl = 'http://example.com/page';
      
      // Mock the canonicalization process
      const scope = nock('https://example.com')
        .head('/page')
        .reply(200, 'OK');

      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === 'https://example.com/page') {
          return {
            ok: true,
            status: 200,
            headers: new Map([['location', 'https://example.com/page']]),
          };
        }
        throw new Error('Not found');
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: true,
        enablePaginationDiscovery: false,
      });

      expect(result.originalUrl).toBe(testUrl);
      expect(result.canonicalized).toBe(true);
      expect(result.resolvedUrl).toContain('https://');
    });

    it('should handle www variants', async () => {
      const testUrl = 'https://example.com/page';
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === 'https://www.example.com/page') {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
          };
        }
        throw new Error('Not found');
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: true,
        enablePaginationDiscovery: false,
      });

      expect(result.canonicalized).toBe(true);
    });

    it('should track redirect chains', async () => {
      const testUrl = 'http://example.com/page';
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === 'http://example.com/page') {
          return {
            ok: false,
            status: 301,
            headers: new Map([['location', 'https://example.com/page']]),
          };
        }
        if (url === 'https://example.com/page') {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
          };
        }
        throw new Error('Not found');
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: true,
        enablePaginationDiscovery: false,
      });

      expect(result.redirectChain).toHaveLength(1);
      expect(result.redirectChain[0].from).toBe(testUrl);
      expect(result.redirectChain[0].to).toContain('https://');
    });
  });

  describe('Pagination Discovery', () => {
    it('should discover pagination from HTML', async () => {
      const testUrl = 'https://example.com/page/1';
      const mockHtml = `
        <html>
          <body>
            <nav class="pagination">
              <a href="/page/1">1</a>
              <a href="/page/2">2</a>
              <a href="/page/3">3</a>
              <a rel="next" href="/page/2">Next</a>
            </nav>
          </body>
        </html>
      `;
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === testUrl) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(mockHtml),
            headers: new Map(),
          };
        }
        if (url.includes('/page/2')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
          };
        }
        return {
          ok: false,
          status: 404,
          headers: new Map(),
        };
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: false,
        enablePaginationDiscovery: true,
      });

      expect(result.paginationDiscovered).toBe(true);
      expect(result.discoveredUrls).toBeDefined();
      expect(result.discoveredUrls.length).toBeGreaterThan(0);
    });

    it('should discover letter-based pagination', async () => {
      const testUrl = 'https://example.com/filter/all/page/1';
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === testUrl) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve('<html><body>Directory page</body></html>'),
            headers: new Map(),
          };
        }
        if (url.includes('/filter/a/') || url.includes('/filter/b/')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
          };
        }
        return {
          ok: false,
          status: 404,
          headers: new Map(),
        };
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: false,
        enablePaginationDiscovery: true,
      });

      expect(result.paginationDiscovered).toBe(true);
      expect(result.discoveredUrls).toBeDefined();
    });
  });

  describe('Batch Processing', () => {
    it('should normalize multiple URLs', async () => {
      const testUrls = [
        'http://example1.com/page',
        'http://example2.com/page',
      ];
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url.includes('https://')) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
          };
        }
        throw new Error('Not found');
      });

      const results = await normalizer.normalizeUrls(testUrls, mockFetchClient, {
        enableCanonicalization: true,
        enablePaginationDiscovery: false,
      });

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.canonicalized).toBe(true);
        expect(result.resolvedUrl).toContain('https://');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle canonicalization failures gracefully', async () => {
      const testUrl = 'http://example.com/page';
      
      mockFetchClient.mockImplementation(async (url, options) => {
        throw new Error('Network error');
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: true,
        enablePaginationDiscovery: false,
      });

      expect(result.originalUrl).toBe(testUrl);
      expect(result.canonicalized).toBe(false);
      expect(result.error).toBeUndefined(); // Should not fail the entire process
    });

    it('should handle pagination discovery failures gracefully', async () => {
      const testUrl = 'https://example.com/page';
      
      mockFetchClient.mockImplementation(async (url, options) => {
        if (url === testUrl) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve('<html><body>No pagination</body></html>'),
            headers: new Map(),
          };
        }
        throw new Error('Network error');
      });

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient, {
        enableCanonicalization: false,
        enablePaginationDiscovery: true,
      });

      expect(result.originalUrl).toBe(testUrl);
      expect(result.paginationDiscovered).toBe(false);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Statistics and Cache Management', () => {
    it('should provide statistics', () => {
      const stats = normalizer.getStats();
      expect(stats).toHaveProperty('canonicalizer');
      expect(stats).toHaveProperty('paginationDiscovery');
    });

    it('should clear caches', () => {
      expect(() => normalizer.clearCaches()).not.toThrow();
    });
  });
});