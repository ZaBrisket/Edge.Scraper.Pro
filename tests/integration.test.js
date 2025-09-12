const { BatchProcessor } = require('../src/lib/batch-processor');
const { UrlNormalizer } = require('../src/pipeline/url-normalizer');
const { ExtractorRouter } = require('../src/extractors/route');
const { EnhancedExporter } = require('../src/exporters/enhanced-exporter');
const { JSDOM } = require('jsdom');
const nock = require('nock');

describe('Integration Tests', () => {
  let mockFetchClient;

  beforeEach(() => {
    mockFetchClient = jest.fn();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('End-to-End Pipeline', () => {
    it('should process news URLs through complete pipeline', async () => {
      const testUrls = [
        'http://example.com/news/article1',
        'https://news.ycombinator.com/item?id=123456',
      ];

      // Mock responses
      const mockHtml = `
        <html>
          <head>
            <title>Test News Article</title>
            <meta name="description" content="Test description">
          </head>
          <body>
            <h1>Test News Article</h1>
            <article>
              <p>This is a test news article with sufficient content to pass validation.</p>
              <p>It contains multiple paragraphs to ensure proper extraction.</p>
              <p>The content should be long enough to meet the minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      nock('https://example.com')
        .get('/news/article1')
        .reply(200, mockHtml);

      nock('https://news.ycombinator.com')
        .get('/item?id=123456')
        .reply(200, mockHtml);

      const processor = new BatchProcessor({
        extractionMode: 'news',
        enableUrlNormalization: true,
        enablePaginationDiscovery: false,
        enableExtractorRouter: true,
        concurrency: 2,
        delayMs: 100,
      });

      const result = await processor.processBatch(testUrls);

      expect(result.stats.totalUrls).toBe(2);
      expect(result.stats.successfulUrls).toBeGreaterThan(0);
      expect(result.results).toHaveLength(2);

      // Check that results have proper structure
      result.results.forEach(item => {
        expect(item).toHaveProperty('url');
        expect(item).toHaveProperty('success');
        expect(item).toHaveProperty('data');
        if (item.success) {
          expect(item.data).toHaveProperty('title');
          expect(item.data).toHaveProperty('content');
          expect(item.data.content.length).toBeGreaterThan(500);
        }
      });
    });

    it('should process sports URLs with auto-detection', async () => {
      const testUrls = [
        'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
        'https://www.basketball-reference.com/players/j/jamesle01.html',
      ];

      const mockSportsHtml = `
        <html>
          <head><title>Player Profile</title></head>
          <body>
            <h1>Player Name</h1>
            <div class="sports-content">
              <p>This is a sports player profile with detailed statistics and information.</p>
              <p>The content includes career stats, achievements, and biographical data.</p>
              <p>This should be sufficient content for sports extraction.</p>
            </div>
          </body>
        </html>
      `;

      nock('https://www.pro-football-reference.com')
        .get('/players/M/MahoPa00.htm')
        .reply(200, mockSportsHtml);

      nock('https://www.basketball-reference.com')
        .get('/players/j/jamesle01.html')
        .reply(200, mockSportsHtml);

      const processor = new BatchProcessor({
        extractionMode: 'auto',
        enableUrlNormalization: true,
        enablePaginationDiscovery: false,
        enableExtractorRouter: true,
        concurrency: 2,
        delayMs: 100,
      });

      const result = await processor.processBatch(testUrls);

      expect(result.stats.totalUrls).toBe(2);
      expect(result.stats.successfulUrls).toBeGreaterThan(0);

      // Check that sports mode was auto-detected
      result.results.forEach(item => {
        if (item.success && item.data) {
          expect(item.data.mode).toBe('sports');
          expect(item.data.sport).toBeDefined();
        }
      });
    });

    it('should process company URLs with pagination discovery', async () => {
      const testUrls = [
        'https://directory.example.com/companies',
        'https://www.linkedin.com/company/example-corp',
      ];

      const mockCompanyHtml = `
        <html>
          <head>
            <title>Example Corp - Software Solutions</title>
            <meta name="description" content="Leading software company">
          </head>
          <body>
            <h1>Example Corp</h1>
            <div class="about">
              <p>We are a leading software company providing innovative solutions.</p>
              <p>Founded in 2010, we have grown to over 50 employees.</p>
              <p>Our team specializes in web development, mobile apps, and cloud solutions.</p>
            </div>
            <div class="contact">
              <p>Email: contact@example.com</p>
              <p>Phone: (555) 123-4567</p>
            </div>
          </body>
        </html>
      `;

      nock('https://directory.example.com')
        .get('/companies')
        .reply(200, mockCompanyHtml);

      nock('https://www.linkedin.com')
        .get('/company/example-corp')
        .reply(200, mockCompanyHtml);

      const processor = new BatchProcessor({
        extractionMode: 'companies',
        enableUrlNormalization: true,
        enablePaginationDiscovery: true,
        enableExtractorRouter: true,
        concurrency: 2,
        delayMs: 100,
      });

      const result = await processor.processBatch(testUrls);

      expect(result.stats.totalUrls).toBe(2);
      expect(result.stats.successfulUrls).toBeGreaterThan(0);

      // Check that company data was extracted
      result.results.forEach(item => {
        if (item.success && item.data) {
          expect(item.data.mode).toBe('companies');
          expect(item.data.title).toContain('Example Corp');
          expect(item.data.contactInfo).toBeDefined();
        }
      });
    });
  });

  describe('URL Normalization Integration', () => {
    it('should normalize URLs and discover pagination', async () => {
      const normalizer = new UrlNormalizer({
        enableCanonicalization: true,
        enablePaginationDiscovery: true,
      });

      const testUrl = 'http://example.com/page/1';
      
      // Mock responses for normalization
      nock('https://example.com')
        .head('/page/1')
        .reply(301, '', { 'Location': 'https://example.com/page/1' });

      nock('https://example.com')
        .get('/page/1')
        .reply(200, `
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
        `);

      nock('https://example.com')
        .head('/page/2')
        .reply(200);

      const result = await normalizer.normalizeUrl(testUrl, mockFetchClient);

      expect(result.originalUrl).toBe(testUrl);
      expect(result.resolvedUrl).toContain('https://');
      expect(result.canonicalized).toBe(true);
      expect(result.paginationDiscovered).toBe(true);
      expect(result.discoveredUrls).toBeDefined();
      expect(result.discoveredUrls.length).toBeGreaterThan(0);
    });
  });

  describe('Extractor Router Integration', () => {
    it('should auto-detect extractor modes correctly', async () => {
      const router = new ExtractorRouter({ mode: 'auto' });

      const testCases = [
        { url: 'https://news.ycombinator.com/item?id=123', expectedMode: 'news' },
        { url: 'https://espn.com/sports/basketball', expectedMode: 'sports' },
        { url: 'https://linkedin.com/company/example', expectedMode: 'companies' },
      ];

      for (const testCase of testCases) {
        const mockHtml = `
          <html>
            <head><title>Test</title></head>
            <body>
              <h1>Test Content</h1>
              <p>This is test content with sufficient length to pass validation requirements.</p>
              <p>It contains multiple paragraphs to ensure proper extraction.</p>
              <p>The content should be long enough to meet the minimum requirements.</p>
            </body>
          </html>
        `;

        const doc = new JSDOM(mockHtml).window.document;
        const result = await router.extract(doc, testCase.url);

        expect(result.data.mode).toBe(testCase.expectedMode);
        expect(result.data.autoDetected).toBe(true);
      }
    });
  });

  describe('Export Integration', () => {
    it('should export data with schema validation', async () => {
      const exporter = new EnhancedExporter();
      
      const testData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalArticles: 2,
          successfulExtractions: 2,
          failedExtractions: 0,
          extractor: 'NewsExtractor',
        },
        articles: [
          {
            url: 'https://example.com/article1',
            title: 'Test Article 1',
            content: 'This is a test article with sufficient content to pass validation.',
            author: 'Test Author',
            publishedDate: '2024-01-15T10:00:00Z',
            extractionInfo: {
              extractor: 'NewsExtractor',
              contentLength: 1000,
              canonicalized: false,
              paginationDiscovered: false,
            },
          },
          {
            url: 'https://example.com/article2',
            title: 'Test Article 2',
            content: 'This is another test article with sufficient content to pass validation.',
            author: 'Test Author 2',
            publishedDate: '2024-01-16T10:00:00Z',
            extractionInfo: {
              extractor: 'NewsExtractor',
              contentLength: 1000,
              canonicalized: false,
              paginationDiscovered: false,
            },
          },
        ],
      };

      // Test JSON export
      const jsonResult = await exporter.export(testData, {
        format: 'json',
        schemaName: 'news',
        validateSchema: true,
        includeMetadata: true,
        includeExtractionInfo: true,
      });

      expect(jsonResult.success).toBe(true);
      expect(jsonResult.filename).toContain('news-');
      expect(jsonResult.mimeType).toBe('application/json');
      expect(jsonResult.validationResult).toBeDefined();
      expect(jsonResult.stats.totalItems).toBe(2);

      // Test CSV export
      const csvResult = await exporter.export(testData, {
        format: 'csv',
        schemaName: 'news',
        validateSchema: true,
        includeMetadata: false,
        includeExtractionInfo: false,
      });

      expect(csvResult.success).toBe(true);
      expect(csvResult.filename).toContain('news-');
      expect(csvResult.mimeType).toBe('text/csv');
      expect(csvResult.data).toContain('URL,Title,Content,Author,Published Date,Description');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const testUrls = [
        'https://nonexistent-domain-12345.com/page',
        'https://httpstat.us/500',
      ];

      nock('https://httpstat.us')
        .get('/500')
        .reply(500, 'Internal Server Error');

      const processor = new BatchProcessor({
        extractionMode: 'news',
        enableUrlNormalization: false,
        enablePaginationDiscovery: false,
        enableExtractorRouter: true,
        concurrency: 1,
        delayMs: 100,
      });

      const result = await processor.processBatch(testUrls);

      expect(result.stats.totalUrls).toBe(2);
      expect(result.stats.failedUrls).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check error categorization
      result.errors.forEach(error => {
        expect(error.category).toBeDefined();
        expect(error.retryable).toBeDefined();
      });
    });

    it('should handle validation errors in exports', async () => {
      const exporter = new EnhancedExporter();
      
      const invalidData = {
        metadata: {
          // Missing required fields
        },
        articles: [
          {
            // Missing required fields
            url: 'https://example.com/article1',
          },
        ],
      };

      const result = await exporter.export(invalidData, {
        format: 'json',
        schemaName: 'news',
        validateSchema: true,
      });

      expect(result.success).toBe(true); // Export should still succeed
      expect(result.validationResult).toBeDefined();
      expect(result.validationResult.valid).toBe(false);
      expect(result.validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large batches efficiently', async () => {
      const largeUrlList = Array.from({ length: 50 }, (_, i) => 
        `https://example.com/article${i}`
      );

      const mockHtml = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <h1>Test Article</h1>
            <p>This is a test article with sufficient content to pass validation.</p>
            <p>It contains multiple paragraphs to ensure proper extraction.</p>
            <p>The content should be long enough to meet the minimum requirements.</p>
          </body>
        </html>
      `;

      // Mock all URLs
      largeUrlList.forEach(url => {
        nock('https://example.com')
          .get(`/article${url.split('article')[1]}`)
          .reply(200, mockHtml);
      });

      const processor = new BatchProcessor({
        extractionMode: 'news',
        enableUrlNormalization: false,
        enablePaginationDiscovery: false,
        enableExtractorRouter: true,
        concurrency: 5,
        delayMs: 10,
      });

      const startTime = Date.now();
      const result = await processor.processBatch(largeUrlList);
      const endTime = Date.now();

      expect(result.stats.totalUrls).toBe(50);
      expect(result.stats.successfulUrls).toBeGreaterThan(40); // Allow some failures
      expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });
});