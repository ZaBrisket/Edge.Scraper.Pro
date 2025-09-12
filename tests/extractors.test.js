const { NewsExtractor } = require('../src/extractors/news');
const { SportsExtractor } = require('../src/extractors/sports');
const { CompaniesExtractor } = require('../src/extractors/companies');
const { ExtractorRouter } = require('../src/extractors/route');
const { JSDOM } = require('jsdom');

describe('Content Extractors', () => {
  let mockDocument;

  beforeEach(() => {
    // Create a mock document for testing
    const mockHtml = `
      <html>
        <head>
          <title>Test Article</title>
          <meta name="description" content="Test description">
        </head>
        <body>
          <h1>Test Article Title</h1>
          <article>
            <p>This is a test article with some content that should be extracted.</p>
            <p>It has multiple paragraphs to test the extraction logic.</p>
            <p>This content should be long enough to pass the minimum length requirement.</p>
          </article>
        </body>
      </html>
    `;
    mockDocument = new JSDOM(mockHtml).window.document;
  });

  describe('NewsExtractor', () => {
    let extractor;

    beforeEach(() => {
      extractor = new NewsExtractor({
        minContentLength: 100,
        enableFallbacks: true,
      });
    });

    it('should extract news article content', async () => {
      const result = await extractor.extract(mockDocument, 'https://example.com/article');

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Test Article Title');
      expect(result.data.content).toContain('test article');
      expect(result.data.url).toBe('https://example.com/article');
      expect(result.extractor).toBe('NewsExtractor');
      expect(result.contentLength).toBeGreaterThan(100);
    });

    it('should handle missing content gracefully', async () => {
      const emptyHtml = '<html><body></body></html>';
      const emptyDoc = new JSDOM(emptyHtml).window.document;
      
      const result = await extractor.extract(emptyDoc, 'https://example.com/empty');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content too short');
    });

    it('should extract metadata', async () => {
      const result = await extractor.extract(mockDocument, 'https://example.com/article');

      expect(result.data.metadata.title).toBe('Test Article');
      expect(result.data.metadata.description).toBe('Test description');
    });
  });

  describe('SportsExtractor', () => {
    let extractor;

    beforeEach(() => {
      extractor = new SportsExtractor({
        minContentLength: 100,
        enableFallbacks: true,
      });
    });

    it('should extract sports content', async () => {
      const sportsHtml = `
        <html>
          <head><title>Game Results</title></head>
          <body>
            <h1>Lakers vs Warriors</h1>
            <div class="sports-content">
              <p>The Lakers defeated the Warriors 120-115 in an exciting game.</p>
              <p>LeBron James led the Lakers with 30 points and 10 assists.</p>
              <p>This was a great basketball game with lots of action.</p>
            </div>
          </body>
        </html>
      `;
      const sportsDoc = new JSDOM(sportsHtml).window.document;

      const result = await extractor.extract(sportsDoc, 'https://espn.com/game');

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Game Results');
      expect(result.data.content).toContain('Lakers defeated');
      expect(result.data.sport).toBe('basketball');
      expect(result.extractor).toBe('SportsExtractor');
    });

    it('should detect sport from content', async () => {
      const footballHtml = `
        <html>
          <body>
            <h1>Football Match</h1>
            <p>This is a football game between two teams.</p>
            <p>The football match was very exciting with great plays.</p>
          </body>
        </html>
      `;
      const footballDoc = new JSDOM(footballHtml).window.document;

      const result = await extractor.extract(footballDoc, 'https://example.com/football');

      expect(result.data.sport).toBe('football');
    });
  });

  describe('CompaniesExtractor', () => {
    let extractor;

    beforeEach(() => {
      extractor = new CompaniesExtractor({
        minContentLength: 100,
        enableFallbacks: true,
      });
    });

    it('should extract company profile', async () => {
      const companyHtml = `
        <html>
          <head>
            <title>Acme Corp - Software Solutions</title>
            <meta name="description" content="Leading software company">
          </head>
          <body>
            <h1>Acme Corp</h1>
            <div class="hero">
              <p>We are a leading software company providing innovative solutions.</p>
            </div>
            <nav>
              <a href="/about">About</a>
              <a href="/services">Services</a>
              <a href="/contact">Contact</a>
            </nav>
            <div class="about">
              <p>Founded in 2010, Acme Corp has been at the forefront of software innovation.</p>
              <p>We specialize in web development, mobile apps, and cloud solutions.</p>
              <p>Our team of 50+ developers works with cutting-edge technologies.</p>
            </div>
          </body>
        </html>
      `;
      const companyDoc = new JSDOM(companyHtml).window.document;

      const result = await extractor.extract(companyDoc, 'https://acmecorp.com');

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Acme Corp - Software Solutions');
      expect(result.data.description).toBe('Leading software company');
      expect(result.data.heroCopy).toContain('leading software company');
      expect(result.data.navigation).toContain('About');
      expect(result.data.industry).toBe('technology');
      expect(result.data.size).toContain('50');
      expect(result.data.founded).toContain('2010');
      expect(result.extractor).toBe('CompaniesExtractor');
    });

    it('should extract contact information', async () => {
      const contactHtml = `
        <html>
          <body>
            <div class="contact">
              <p>Email: contact@example.com</p>
              <p>Phone: (555) 123-4567</p>
              <p>Address: 123 Main St, City, ST 12345</p>
            </div>
          </body>
        </html>
      `;
      const contactDoc = new JSDOM(contactHtml).window.document;

      const result = await extractor.extract(contactDoc, 'https://example.com/contact');

      expect(result.data.contactInfo.email).toBe('contact@example.com');
      expect(result.data.contactInfo.phone).toBe('(555) 123-4567');
      expect(result.data.contactInfo.address).toContain('123 Main St');
    });
  });

  describe('ExtractorRouter', () => {
    let router;

    beforeEach(() => {
      router = new ExtractorRouter({
        mode: 'auto',
        minContentLength: 100,
        enableFallbacks: true,
      });
    });

    it('should auto-detect news mode', async () => {
      const result = await router.extract(mockDocument, 'https://news.ycombinator.com/item?id=123');

      expect(result.data.mode).toBe('news');
      expect(result.data.autoDetected).toBe(true);
    });

    it('should auto-detect sports mode', async () => {
      const result = await router.extract(mockDocument, 'https://espn.com/sports/basketball');

      expect(result.data.mode).toBe('sports');
      expect(result.data.autoDetected).toBe(true);
    });

    it('should auto-detect companies mode', async () => {
      const result = await router.extract(mockDocument, 'https://linkedin.com/company/example');

      expect(result.data.mode).toBe('companies');
      expect(result.data.autoDetected).toBe(true);
    });

    it('should use specified mode when provided', async () => {
      const result = await router.extract(mockDocument, 'https://example.com/page', 'companies');

      expect(result.data.mode).toBe('companies');
      expect(result.data.autoDetected).toBe(false);
    });

    it('should provide available modes', () => {
      const modes = router.getAvailableModes();
      expect(modes).toContain('news');
      expect(modes).toContain('sports');
      expect(modes).toContain('companies');
      expect(modes).toContain('auto');
    });

    it('should provide statistics', () => {
      const stats = router.getStats();
      expect(stats.mode).toBe('auto');
      expect(stats.availableModes).toBeDefined();
      expect(stats.extractors).toBeDefined();
    });
  });

  describe('Zero-character regression fix', () => {
    it('should prevent zero-character extraction', async () => {
      const emptyHtml = '<html><body><script>console.log("test");</script></body></html>';
      const emptyDoc = new JSDOM(emptyHtml).window.document;
      
      const extractor = new NewsExtractor({
        minContentLength: 500,
        enableFallbacks: true,
      });

      const result = await extractor.extract(emptyDoc, 'https://example.com/empty');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content too short');
      expect(result.contentLength).toBeLessThan(500);
    });

    it('should use fallback extraction methods', async () => {
      const minimalHtml = `
        <html>
          <body>
            <div class="content">
              <p>This is some content that should be extracted.</p>
            </div>
          </body>
        </html>
      `;
      const minimalDoc = new JSDOM(minimalHtml).window.document;
      
      const extractor = new NewsExtractor({
        minContentLength: 50,
        enableFallbacks: true,
      });

      const result = await extractor.extract(minimalDoc, 'https://example.com/minimal');

      expect(result.success).toBe(true);
      expect(result.contentLength).toBeGreaterThan(50);
    });
  });
});