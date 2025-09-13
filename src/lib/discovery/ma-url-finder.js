const axios = require('axios');
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');

class MAUrlFinder {
  constructor() {
    this.maKeywords = [
      'merger', 'acquisition', 'acquire', 'acquires', 'acquired',
      'buyout', 'takeover', 'deal', 'transaction', 'purchase',
      'divestiture', 'divest', 'joint venture', 'strategic partnership'
    ];
    
    this.rssFeedUrls = {
      'businesswire': [
        'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtRXQ==',
        'https://www.businesswire.com/rss/home/?feedCode=Home&rss=1'
      ],
      'prnewswire': [
        'https://www.prnewswire.com/rss/financial-services-latest-news.rss',
        'https://www.prnewswire.com/rss/mergers-acquisitions-latest-news.rss'
      ],
      'globenewswire': [
        'https://www.globenewswire.com/RssFeed/keyword/merger',
        'https://www.globenewswire.com/RssFeed/keyword/acquisition'
      ]
    };
  }

  async discoverFromRSS(source) {
    const urls = [];
    const feeds = this.rssFeedUrls[source] || [];
    
    for (const feedUrl of feeds) {
      try {
        const response = await axios.get(feedUrl, { timeout: 10000 });
        const result = await parseStringPromise(response.data);
        
        if (result.rss && result.rss.channel) {
          const items = result.rss.channel[0].item || [];
          items.forEach(item => {
            if (item.link && item.link[0]) {
              const title = item.title ? item.title[0] : '';
              if (this.isMARelated(title)) {
                urls.push({
                  url: item.link[0],
                  title: title,
                  date: item.pubDate ? item.pubDate[0] : null,
                  source: source
                });
              }
            }
          });
        }
      } catch (error) {
        console.error(`RSS feed error for ${source}:`, error.message);
      }
    }
    
    return urls;
  }

  async discoverFromSitemap(baseUrl) {
    const urls = [];
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/news-sitemap.xml`,
      `${baseUrl}/sitemap/news.xml`
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, { timeout: 10000 });
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        $('url loc').each((i, elem) => {
          const url = $(elem).text();
          if (url && this.isMARelated(url)) {
            urls.push({
              url: url,
              source: new URL(baseUrl).hostname
            });
          }
        });
        
        if (urls.length > 0) break;
      } catch (error) {
        // Silently continue to next sitemap URL
      }
    }
    
    return urls;
  }

  async searchNewsAPI(keywords, dateFrom, dateTo) {
    const urls = [];
    const searchEndpoints = [
      {
        url: 'https://www.businesswire.com/portal/site/home/search/',
        params: { searchType: 'news', searchTerm: keywords }
      },
      {
        url: 'https://www.prnewswire.com/search/news/',
        params: { keyword: keywords, pagesize: 25 }
      }
    ];
    
    for (const endpoint of searchEndpoints) {
      try {
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const $ = cheerio.load(response.data);
        $('a[href*="news-releases"], a[href*="news/"], .news-link, .release-link').each((i, elem) => {
          const href = $(elem).attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `https://${new URL(endpoint.url).hostname}${href}`;
            urls.push({
              url: fullUrl,
              title: $(elem).text().trim(),
              source: new URL(endpoint.url).hostname
            });
          }
        });
      } catch (error) {
        console.error(`Search API error:`, error.message);
      }
    }
    
    return urls;
  }

  isMARelated(text) {
    const lowerText = text.toLowerCase();
    return this.maKeywords.some(keyword => lowerText.includes(keyword));
  }

  async discover(options = {}) {
    const {
      sources = ['businesswire', 'prnewswire', 'globenewswire'],
      keywords = '',
      dateFrom = null,
      dateTo = null,
      maxUrls = 100
    } = options;
    
    const allUrls = [];
    
    // Discover from RSS feeds
    for (const source of sources) {
      const rssUrls = await this.discoverFromRSS(source);
      allUrls.push(...rssUrls);
    }
    
    // Search with keywords if provided
    if (keywords) {
      const searchUrls = await this.searchNewsAPI(keywords, dateFrom, dateTo);
      allUrls.push(...searchUrls);
    }
    
    // Deduplicate and limit
    const uniqueUrls = Array.from(new Map(allUrls.map(item => [item.url, item])).values());
    return uniqueUrls.slice(0, maxUrls);
  }
}

module.exports = MAUrlFinder;