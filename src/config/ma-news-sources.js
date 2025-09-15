module.exports = {
  sources: {
    'businesswire': {
      name: 'Business Wire',
      baseUrl: 'https://www.businesswire.com',
      searchUrl: 'https://www.businesswire.com/portal/site/home/search/',
      rssFeeds: [
        'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtRXQ==',
        'https://www.businesswire.com/rss/home/?feedCode=Home&rss=1'
      ],
      selectors: {
        title: 'h1.bw-release-title, h1[itemprop="headline"], .headline, h1',
        date: 'time.bw-release-date, time[datetime], .release-date, .date',
        body: 'div.bw-release-body, article[itemprop="articleBody"], .release-body, .body-content, article',
        company: 'span.bw-release-company, .company-name',
        contact: 'div.bw-contact, .contact-info'
      },
      rateLimit: {
        requestsPerSecond: 2,
        burst: 5,
        retryAfter: 5000
      }
    },
    
    'prnewswire': {
      name: 'PR Newswire',
      baseUrl: 'https://www.prnewswire.com',
      searchUrl: 'https://www.prnewswire.com/search/news/',
      rssFeeds: [
        'https://www.prnewswire.com/rss/financial-services-latest-news.rss',
        'https://www.prnewswire.com/rss/mergers-acquisitions-latest-news.rss',
        'https://www.prnewswire.com/rss/money-latest-news.rss'
      ],
      selectors: {
        title: 'h1.release-title, h1.newsreleaseconstituenttitle, h1, .title',
        date: 'p.release-date, .release-date-time, time, .date',
        body: 'section.release-body, .release-body-container, article.news-release, article, .content',
        ticker: 'span.ticker-symbol, .stock-ticker',
        location: 'span.location, .dateline'
      },
      rateLimit: {
        requestsPerSecond: 1,
        burst: 3,
        retryAfter: 10000
      }
    },
    
    'globenewswire': {
      name: 'GlobeNewswire',
      baseUrl: 'https://www.globenewswire.com',
      searchUrl: 'https://www.globenewswire.com/search/',
      rssFeeds: [
        'https://www.globenewswire.com/RssFeed/keyword/merger',
        'https://www.globenewswire.com/RssFeed/keyword/acquisition',
        'https://www.globenewswire.com/RssFeed/organization/0/includesearch/merger'
      ],
      selectors: {
        title: 'h1.main-title, .article-title, h1',
        date: 'span.article-published, .publish-date, time',
        body: 'div.main-body-container, .article-body, article',
        tags: 'div.tags-container a, .article-tags',
        source: 'span.source-name'
      },
      rateLimit: {
        requestsPerSecond: 1,
        burst: 2,
        retryAfter: 8000
      }
    },
    
    'reuters': {
      name: 'Reuters',
      baseUrl: 'https://www.reuters.com',
      searchUrl: 'https://www.reuters.com/search/news',
      rssFeeds: [
        'https://www.reuters.com/rssFeed/mergersNews',
        'https://www.reuters.com/rssFeed/businessNews'
      ],
      selectors: {
        title: 'h1[data-testid="Heading"], h1.headline, h1',
        date: 'time[datetime], span.date-time',
        body: 'div[data-testid="Body"], .article-body-wrapper, article',
        author: 'a[data-testid="AuthorName"], .author-name',
        category: 'a[data-testid="SectionName"], .article-section'
      },
      rateLimit: {
        requestsPerSecond: 0.5,
        burst: 2,
        retryAfter: 15000
      }
    },
    
    'bloomberg': {
      name: 'Bloomberg',
      baseUrl: 'https://www.bloomberg.com',
      searchUrl: 'https://www.bloomberg.com/search',
      rssFeeds: [],
      selectors: {
        title: 'h1.headline, h1[data-component="headline"], h1',
        date: 'time[datetime], .published-at',
        body: 'div.body-content, .article-content, article',
        author: 'div.author, .byline',
        paywall: 'div.paywall-overlay'
      },
      rateLimit: {
        requestsPerSecond: 0.3,
        burst: 1,
        retryAfter: 20000
      }
    },
    
    'seekingalpha': {
      name: 'Seeking Alpha',
      baseUrl: 'https://seekingalpha.com',
      searchUrl: 'https://seekingalpha.com/search',
      rssFeeds: [
        'https://seekingalpha.com/feed/news.xml'
      ],
      selectors: {
        title: 'h1[data-test-id="post-title"], h1',
        date: 'time[datetime], [data-test-id="post-date"]',
        body: '[data-test-id="article-content"], article',
        author: '[data-test-id="author-name"]'
      },
      rateLimit: {
        requestsPerSecond: 0.5,
        burst: 2,
        retryAfter: 10000
      }
    }
  },
  
  getSource: function(sourceName) {
    return this.sources[sourceName] || null;
  },
  
  getAllSources: function() {
    return Object.keys(this.sources);
  },
  
  getSourceByUrl: function(url) {
    for (const [key, source] of Object.entries(this.sources)) {
      if (url.includes(source.baseUrl.replace('https://', '').replace('http://', ''))) {
        return { key, ...source };
      }
    }
    return null;
  }
};