module.exports = {
  sources: {
    'businesswire': {
      baseUrl: 'https://www.businesswire.com',
      searchUrl: 'https://www.businesswire.com/portal/site/home/search/',
      selectors: {
        title: 'h1.bw-release-title, h1[itemprop="headline"], .headline',
        date: 'time.bw-release-date, time[datetime], .release-date',
        body: 'div.bw-release-body, article[itemprop="articleBody"], .release-body',
        company: 'span.bw-release-company, .company-name',
        contact: 'div.bw-contact, .contact-info'
      },
      rateLimit: { rps: 2, burst: 5, retryAfter: 5000 }
    },
    'prnewswire': {
      baseUrl: 'https://www.prnewswire.com',
      searchUrl: 'https://www.prnewswire.com/search/news/',
      selectors: {
        title: 'h1.release-title, h1.newsreleaseconstituenttitle',
        date: 'p.release-date, .release-date-time',
        body: 'section.release-body, .release-body-container, article.news-release',
        ticker: 'span.ticker-symbol, .stock-ticker',
        location: 'span.location, .dateline'
      },
      rateLimit: { rps: 1, burst: 3, retryAfter: 10000 }
    },
    'globenewswire': {
      baseUrl: 'https://www.globenewswire.com',
      searchUrl: 'https://www.globenewswire.com/search/',
      selectors: {
        title: 'h1.main-title, .article-title',
        date: 'span.article-published, .publish-date',
        body: 'div.main-body-container, .article-body',
        tags: 'div.tags-container a, .article-tags',
        source: 'span.source-name'
      },
      rateLimit: { rps: 1, burst: 2, retryAfter: 8000 }
    },
    'reuters': {
      baseUrl: 'https://www.reuters.com',
      searchUrl: 'https://www.reuters.com/search/news',
      selectors: {
        title: 'h1[data-testid="Heading"], h1.headline',
        date: 'time[datetime], span.date-time',
        body: 'div[data-testid="Body"], .article-body-wrapper',
        author: 'a[data-testid="AuthorName"], .author-name',
        category: 'a[data-testid="SectionName"], .article-section'
      },
      rateLimit: { rps: 0.5, burst: 2, retryAfter: 15000 }
    },
    'bloomberg': {
      baseUrl: 'https://www.bloomberg.com',
      searchUrl: 'https://www.bloomberg.com/search',
      selectors: {
        title: 'h1.headline, h1[data-component="headline"]',
        date: 'time[datetime], .published-at',
        body: 'div.body-content, .article-content',
        author: 'div.author, .byline',
        paywall: 'div.paywall-overlay'
      },
      rateLimit: { rps: 0.3, burst: 1, retryAfter: 20000 }
    }
  },
  
  getSelector: function(source, field) {
    if (this.sources[source] && this.sources[source].selectors[field]) {
      return this.sources[source].selectors[field];
    }
    return null;
  },
  
  getRateLimit: function(source) {
    if (this.sources[source] && this.sources[source].rateLimit) {
      return this.sources[source].rateLimit;
    }
    return { rps: 0.5, burst: 1, retryAfter: 10000 };
  }
};