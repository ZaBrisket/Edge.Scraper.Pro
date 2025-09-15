/**
 * Universal site profiles for M&A news outlets and PR wire services
 * Handles anti-bot protection across major business news sources
 */

const SITE_PROFILES = {
  // PR Wire Services
  'prnewswire.com': {
    category: 'pr_wire',
    rateLimit: { rps: 0.3, burst: 1 },
    requiresBrowser: true,
    selectors: {
      content: ['div.release-body', 'div.news-release', 'article.news-release-article'],
      title: ['h1.news-release-title', 'h1'],
      date: ['p.news-release-timepass', 'time', 'span.release-date']
    },
    headers: {
      'Referer': 'https://www.google.com/',
      'X-Requested-With': 'XMLHttpRequest'
    }
  },
  
  'businesswire.com': {
    category: 'pr_wire',
    rateLimit: { rps: 0.25, burst: 1 },
    requiresBrowser: true,
    selectors: {
      content: ['div.bw-release-body', 'div.bwc-body', 'article.bw-release-main'],
      title: ['h1.bw-release-title', 'h1'],
      date: ['time.bw-release-date', 'div.bw-release-timestamp']
    },
    cloudflareProtected: true
  },
  
  // Business Intelligence
  'cbinsights.com': {
    category: 'business_intel',
    rateLimit: { rps: 0.2, burst: 1 },
    requiresBrowser: true,
    javascriptRequired: true,
    selectors: {
      content: ['div.research-content', 'article.insights-article', 'div.article-content'],
      title: ['h1.article-title', 'h1'],
      date: ['span.publish-date', 'time']
    },
    waitForSelector: 'div.research-content'
  },
  
  // Major News Outlets
  'reuters.com': {
    category: 'news',
    rateLimit: { rps: 0.3, burst: 2 },
    selectors: {
      content: ['div.article-body__content', 'div[data-testid="article-body"]', 'div.StandardArticleBody_body'],
      title: ['h1', 'h1[data-testid="headline"]'],
      date: ['time', 'span.DateLine']
    },
    cookieConsent: true
  },
  
  'bloomberg.com': {
    category: 'news',
    rateLimit: { rps: 0.15, burst: 1 },
    requiresAuth: true,
    selectors: {
      content: ['div.body-content', 'div.article-content', 'main article'],
      title: ['h1.headline', 'h1'],
      date: ['time', 'div.published-at']
    },
    paywallDetection: ['div.paywall', 'div.subscription-required']
  },
  
  'wsj.com': {
    category: 'news',
    rateLimit: { rps: 0.15, burst: 1 },
    requiresAuth: true,
    selectors: {
      content: ['div.article-content', 'div.wsj-snippet-body', 'section.snippet'],
      title: ['h1.wsj-article-headline', 'h1'],
      date: ['time', 'span.timestamp']
    },
    paywallDetection: ['div.wsj-snippet-login', 'div.paywall-overlay']
  },
  
  'insurancejournal.com': {
    category: 'trade_pub',
    rateLimit: { rps: 0.2, burst: 1 },
    selectors: {
      content: ['article.article-content', 'div.article-body', 'div.entry-content'],
      title: ['h1.entry-title', 'h1'],
      date: ['time.entry-date', 'span.published']
    }
  },
  
  // Financial News
  'marketwatch.com': {
    category: 'financial',
    rateLimit: { rps: 0.3, burst: 2 },
    selectors: {
      content: ['div.article__body', 'div.paywall-content', 'div[data-module="article-body"]'],
      title: ['h1.article__headline', 'h1'],
      date: ['time.article__timestamp', 'span.published-date']
    }
  },
  
  'seekingalpha.com': {
    category: 'financial',
    rateLimit: { rps: 0.25, burst: 1 },
    requiresBrowser: true,
    selectors: {
      content: ['div[data-test-id="article-content"]', 'div.article-content', 'section.article'],
      title: ['h1[data-test-id="article-title"]', 'h1'],
      date: ['time', 'span[data-test-id="article-date"]']
    }
  },
  
  'yahoo.com': {
    category: 'financial',
    rateLimit: { rps: 0.5, burst: 3 },
    selectors: {
      content: ['div.caas-body', 'div.article-body', 'div[data-test-locator="article-body"]'],
      title: ['h1', 'header h1'],
      date: ['time', 'span.caas-attr-time-style']
    }
  },
  
  // Tech News
  'techcrunch.com': {
    category: 'tech',
    rateLimit: { rps: 0.4, burst: 2 },
    selectors: {
      content: ['div.article-content', 'div.post-content', 'div.entry-content'],
      title: ['h1.article__title', 'h1'],
      date: ['time.article__byline__timestamp', 'time']
    }
  },
  
  'venturebeat.com': {
    category: 'tech',
    rateLimit: { rps: 0.4, burst: 2 },
    selectors: {
      content: ['div.article-content', 'section.article-content', 'div.entry-content'],
      title: ['h1.article-title', 'h1'],
      date: ['time.the-time', 'time']
    }
  },
  
  // Default fallback for unknown sites
  'default': {
    category: 'general',
    rateLimit: { rps: 0.5, burst: 2 },
    selectors: {
      content: ['main article', 'article', 'div.content', 'div.article-body', '[role="main"]'],
      title: ['h1', 'h2', 'title'],
      date: ['time', '[datetime]', '.date', '.published']
    }
  }
};

/**
 * Get site profile with intelligent fallback
 */
function getSiteProfile(url) {
  const hostname = new URL(url).hostname.replace('www.', '');
  
  // Direct match
  if (SITE_PROFILES[hostname]) {
    return { ...SITE_PROFILES[hostname], hostname };
  }
  
  // Check for subdomain match (e.g., markets.businesswire.com)
  const baseDomain = hostname.split('.').slice(-2).join('.');
  if (SITE_PROFILES[baseDomain]) {
    return { ...SITE_PROFILES[baseDomain], hostname };
  }
  
  // Category-based fallback
  if (hostname.includes('wire') || hostname.includes('newswire') || hostname.includes('pr')) {
    return { ...SITE_PROFILES['prnewswire.com'], hostname };
  }
  
  return { ...SITE_PROFILES['default'], hostname };
}

module.exports = {
  SITE_PROFILES,
  getSiteProfile
};