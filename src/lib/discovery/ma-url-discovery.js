const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');

class MAUrlDiscovery {
  constructor() {
    this.maKeywords = [
      'merger', 'acquisition', 'acquire', 'acquires', 'acquired',
      'buyout', 'takeover', 'deal', 'transaction', 'purchase',
      'M&A', 'divestiture', 'divest', 'joint venture', 'JV',
      'strategic partnership', 'consolidation', 'combination'
    ];
    
    this.parser = new xml2js.Parser();
  }

  async discoverFromRSS(source, sourceConfig) {
    const urls = [];
    const feeds = sourceConfig.rssFeeds || [];
    
    for (const feedUrl of feeds) {
      try {
        const response = await axios.get(feedUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const result = await this.parser.parseStringPromise(response.data);
        
        // Handle RSS 2.0 format
        if (result.rss && result.rss.channel) {
          const items = result.rss.channel[0].item || [];
          for (const item of items) {
            if (this.isMARelated(item.title?.[0] || '')) {
              urls.push({
                url: item.link?.[0] || '',
                title: item.title?.[0] || '',
                date: item.pubDate?.[0] || '',
                description: item.description?.[0] || '',
                source: source
              });
            }
          }
        }
        
        // Handle Atom format
        if (result.feed && result.feed.entry) {
          const entries = result.feed.entry || [];
          for (const entry of entries) {
            if (this.isMARelated(entry.title?.[0] || '')) {
              urls.push({
                url: entry.link?.[0]?.$.href || '',
                title: entry.title?.[0] || '',
                date: entry.published?.[0] || entry.updated?.[0] || '',
                description: entry.summary?.[0] || '',
                source: source
              });
            }
          }
        }
      } catch (error) {
        console.error(`RSS feed error for ${source}: ${error.message}`);
      }
    }
    
    return urls;
  }

  async searchForMANews(keywords, sourceConfig) {
    const urls = [];
    
    if (!sourceConfig.searchUrl) return urls;
    
    try {
      const searchTerms = keywords || this.maKeywords.slice(0, 3).join(' ');
      const searchUrl = `${sourceConfig.searchUrl}?q=${encodeURIComponent(searchTerms)}`;
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Common news link selectors
      const linkSelectors = [
        'a[href*="news-releases"]',
        'a[href*="news/"]',
        'a[href*="article"]',
        'a[href*="story"]',
        '.news-link',
        '.release-link',
        '.headline a',
        'h2 a',
        'h3 a'
      ];
      
      $(linkSelectors.join(', ')).each((i, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href');
        const text = $elem.text().trim();
        
        if (href && this.isMARelated(text)) {
          const fullUrl = this.resolveUrl(href, sourceConfig.baseUrl);
          urls.push({
            url: fullUrl,
            title: text,
            source: sourceConfig.name
          });
        }
      });
    } catch (error) {
      console.error(`Search error: ${error.message}`);
    }
    
    return urls;
  }

  async discoverFromSitemap(sourceConfig) {
    const urls = [];
    const sitemapUrls = [
      `${sourceConfig.baseUrl}/sitemap.xml`,
      `${sourceConfig.baseUrl}/sitemap_index.xml`,
      `${sourceConfig.baseUrl}/news-sitemap.xml`,
      `${sourceConfig.baseUrl}/sitemap/news.xml`
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MANewsScraper/1.0)'
          }
        });
        
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        $('url loc').each((i, elem) => {
          const url = $(elem).text();
          if (url && this.isMARelated(url)) {
            urls.push({
              url: url,
              source: sourceConfig.name
            });
          }
        });
        
        if (urls.length > 0) break;
      } catch (error) {
        // Silently continue to next sitemap
      }
    }
    
    return urls;
  }

  isMARelated(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.maKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  resolveUrl(url, baseUrl) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    if (url.startsWith('/')) {
      return baseUrl + url;
    }
    return baseUrl + '/' + url;
  }

  async discover(options = {}) {
    const {
      sources = ['businesswire', 'prnewswire', 'globenewswire'],
      keywords = '',
      maxUrls = 100,
      useRSS = true,
      useSearch = true,
      useSitemap = false
    } = options;
    
    const newsSources = require('../../config/ma-news-sources');
    const allUrls = [];
    
    for (const source of sources) {
      const sourceConfig = newsSources.getSource(source);
      if (!sourceConfig) continue;
      
      // RSS Discovery
      if (useRSS) {
        const rssUrls = await this.discoverFromRSS(source, sourceConfig);
        allUrls.push(...rssUrls);
      }
      
      // Search Discovery
      if (useSearch && keywords) {
        const searchUrls = await this.searchForMANews(keywords, sourceConfig);
        allUrls.push(...searchUrls);
      }
      
      // Sitemap Discovery
      if (useSitemap) {
        const sitemapUrls = await this.discoverFromSitemap(sourceConfig);
        allUrls.push(...sitemapUrls);
      }
    }
    
    // Deduplicate URLs
    const uniqueUrls = Array.from(
      new Map(allUrls.map(item => [item.url, item])).values()
    );
    
    return uniqueUrls.slice(0, maxUrls);
  }
}

module.exports = MAUrlDiscovery;