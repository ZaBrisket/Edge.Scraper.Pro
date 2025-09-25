/**
 * Content-Aware Extraction System
 * Detects content type and applies appropriate extraction strategy
 */

const cheerio = require('cheerio');

class ContentExtractor {
  constructor() {
    this.extractors = {
      news: new NewsExtractor(),
      sports: new SportsExtractor(),
      directory: new DirectoryExtractor(),
      generic: new GenericExtractor()
    };
    
    this.patterns = this.loadPatterns();
  }
  
  loadPatterns() {
    return {
      news: {
        urlPatterns: [
          /\/news\//i,
          /\/article\//i,
          /\/story\//i,
          /\/blog\//i,
          /\/post\//i,
          /insurancejournal\.com/i,
          /reuters\.com/i,
          /bloomberg\.com/i
        ],
        domSelectors: [
          'article',
          '[role="article"]',
          '.article-content',
          '#article-content',
          '[itemprop="articleBody"]',
          '.story-body',
          '.post-content'
        ],
        requiredElements: ['h1', 'p'],
        metadataSelectors: {
          title: ['h1', 'meta[property="og:title"]', 'title'],
          author: [
            '[itemprop="author"]',
            '.author',
            '.byline',
            'meta[name="author"]',
            '[rel="author"]'
          ],
          date: [
            'time[datetime]',
            '[itemprop="datePublished"]',
            'meta[property="article:published_time"]',
            '.publish-date',
            '.timestamp'
          ],
          category: [
            '[itemprop="articleSection"]',
            '.category',
            '.section',
            'meta[property="article:section"]'
          ]
        }
      },
      sports: {
        urlPatterns: [
          /pro.*reference\.com/i,
          /espn\.com\/player/i,
          /\/stats\//i,
          /\/player\//i,
          /\/athlete\//i
        ],
        domSelectors: [
          '#info',
          '.stats_table',
          '#all_stats',
          '.player-header',
          '[data-stat]'
        ],
        requiredElements: ['table'],
        specificExtraction: true
      },
      directory: {
        urlPatterns: [
          /\/directory\//i,
          /\/listing\//i,
          /\/filter\//i,
          /\/search\//i,
          /\/results\//i,
          /\/page\/\d+/i
        ],
        domSelectors: [
          '.listing-item',
          '.result-card',
          '.directory-entry',
          '.search-result',
          '[role="listitem"]'
        ],
        requiredElements: ['a'],
        pagination: true
      }
    };
  }
  
  detectContentType(url, html) {
    const $ = cheerio.load(html);
    const scores = {};
    
    // Check each content type
    for (const [type, pattern] of Object.entries(this.patterns)) {
      let score = 0;
      
      // Check URL patterns
      for (const urlPattern of pattern.urlPatterns || []) {
        if (urlPattern.test(url)) {
          score += 10;
          break;
        }
      }
      
      // Check DOM selectors
      for (const selector of pattern.domSelectors || []) {
        if ($(selector).length > 0) {
          score += 5;
        }
      }
      
      // Check required elements
      if (pattern.requiredElements) {
        const hasAll = pattern.requiredElements.every(elem => $(elem).length > 0);
        if (hasAll) score += 15;
      }
      
      scores[type] = score;
    }
    
    // Return type with highest score, default to generic
    let bestType = 'generic';
    let bestScore = 0;
    
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    
    console.info(`[ContentExtractor] Detected type: ${bestType} (score: ${bestScore}) for ${url}`);
    return bestType;
  }
  
  extract(url, html) {
    const contentType = this.detectContentType(url, html);
    const extractor = this.extractors[contentType] || this.extractors.generic;
    
    try {
      const result = extractor.extract(url, html);
      return {
        ...result,
        contentType,
        extractionMethod: extractor.constructor.name
      };
    } catch (error) {
      console.error(`[ContentExtractor] Extraction failed:`, error);
      
      // Fallback to generic extractor
      if (contentType !== 'generic') {
        console.info('[ContentExtractor] Falling back to generic extractor');
        return this.extractors.generic.extract(url, html);
      }
      
      throw error;
    }
  }
}

class NewsExtractor {
  extract(url, html) {
    const $ = cheerio.load(html);
    const result = {
      url,
      title: null,
      content: null,
      author: null,
      date: null,
      category: null,
      images: [],
      links: []
    };
    
    // Extract title
    result.title = this.extractTitle($);
    
    // Extract main content
    result.content = this.extractContent($);
    
    // Extract metadata
    result.author = this.extractAuthor($);
    result.date = this.extractDate($);
    result.category = this.extractCategory($);
    
    // Extract images
    result.images = this.extractImages($, url);
    
    // Extract links
    result.links = this.extractLinks($, url);
    
    return result;
  }
  
  extractTitle($) {
    // Try multiple strategies
    const strategies = [
      () => $('meta[property="og:title"]').attr('content'),
      () => $('h1').first().text().trim(),
      () => $('title').text().split('|')[0].trim(),
      () => $('[itemprop="headline"]').text().trim(),
      () => $('.article-title, .post-title').first().text().trim()
    ];
    
    for (const strategy of strategies) {
      const title = strategy();
      if (title && title.length > 0) {
        return title.substring(0, 500);
      }
    }
    
    return null;
  }
  
  extractContent($) {
    // Try to find article body
    const selectors = [
      'article',
      '[itemprop="articleBody"]',
      '.article-content',
      '.post-content',
      '.story-body',
      '.entry-content',
      '#article-body',
      'main'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        // Remove unwanted elements
        element.find('script, style, noscript, iframe, .advertisement, .social-share').remove();
        
        // Extract text
        const paragraphs = element.find('p').map((i, el) => $(el).text().trim()).get();
        const content = paragraphs.filter(p => p.length > 20).join('\n\n');
        
        if (content.length > 100) {
          return content;
        }
      }
    }
    
    // Fallback: get all paragraphs
    const allParagraphs = $('p').map((i, el) => $(el).text().trim()).get();
    return allParagraphs.filter(p => p.length > 50).join('\n\n');
  }
  
  extractAuthor($) {
    const selectors = [
      'meta[name="author"]',
      '[itemprop="author"]',
      '.author',
      '.byline',
      '.by-author',
      '[rel="author"]'
    ];
    
    for (const selector of selectors) {
      if (selector.startsWith('meta')) {
        const content = $(selector).attr('content');
        if (content) return content.trim();
      } else {
        const text = $(selector).first().text().trim();
        if (text) {
          // Clean up common patterns
          return text.replace(/^by\s+/i, '').replace(/^\s*,\s*/, '').trim();
        }
      }
    }
    
    return null;
  }
  
  extractDate($) {
    const selectors = [
      'meta[property="article:published_time"]',
      'time[datetime]',
      '[itemprop="datePublished"]',
      '.publish-date',
      '.timestamp',
      '.date'
    ];
    
    for (const selector of selectors) {
      if (selector.startsWith('meta')) {
        const content = $(selector).attr('content');
        if (content) return this.parseDate(content);
      } else if (selector === 'time[datetime]') {
        const datetime = $('time[datetime]').first().attr('datetime');
        if (datetime) return this.parseDate(datetime);
      } else {
        const text = $(selector).first().text().trim();
        if (text) return this.parseDate(text);
      }
    }
    
    return null;
  }
  
  extractCategory($) {
    const selectors = [
      'meta[property="article:section"]',
      '[itemprop="articleSection"]',
      '.category',
      '.section',
      '.topic',
      'nav .active'
    ];
    
    for (const selector of selectors) {
      if (selector.startsWith('meta')) {
        const content = $(selector).attr('content');
        if (content) return content.trim();
      } else {
        const text = $(selector).first().text().trim();
        if (text && text.length < 50) return text;
      }
    }
    
    return null;
  }
  
  extractImages($, baseUrl) {
    const images = [];
    
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      const alt = $(elem).attr('alt');
      
      if (src && !src.includes('logo') && !src.includes('icon')) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          images.push({
            src: absoluteUrl,
            alt: alt || null
          });
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    return images.slice(0, 10); // Limit to 10 images
  }
  
  extractLinks($, baseUrl) {
    const links = [];
    const seen = new Set();
    
    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const absoluteUrl = new URL(href, baseUrl).href;
          
          if (!seen.has(absoluteUrl)) {
            seen.add(absoluteUrl);
            links.push({
              url: absoluteUrl,
              text: text.substring(0, 100)
            });
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    return links.slice(0, 20); // Limit to 20 links
  }
  
  parseDate(dateString) {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (e) {
      // Invalid date
    }
    return dateString; // Return original if can't parse
  }
}

class SportsExtractor {
  extract(url, html) {
    // Reuse existing sports extraction logic from the codebase
    const $ = cheerio.load(html);
    
    return {
      url,
      title: $('h1').first().text().trim(),
      playerName: $('#info h1').text().trim(),
      position: $('[itemprop="role"]').text().trim(),
      stats: this.extractStats($),
      content: this.extractBio($)
    };
  }
  
  extractStats($) {
    const stats = {};
    
    $('.stats_table').each((i, table) => {
      const tableId = $(table).attr('id');
      const rows = [];
      
      $(table).find('tbody tr').each((j, row) => {
        const rowData = {};
        $(row).find('td, th').each((k, cell) => {
          const stat = $(cell).attr('data-stat');
          if (stat) {
            rowData[stat] = $(cell).text().trim();
          }
        });
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
      
      if (rows.length > 0) {
        stats[tableId] = rows;
      }
    });
    
    return stats;
  }
  
  extractBio($) {
    const bio = [];
    $('#info p').each((i, p) => {
      bio.push($(p).text().trim());
    });
    return bio.join('\n');
  }
}

class DirectoryExtractor {
  extract(url, html) {
    const $ = cheerio.load(html);
    
    return {
      url,
      title: $('title').text().trim(),
      listings: this.extractListings($),
      pagination: this.extractPagination($),
      content: null
    };
  }
  
  extractListings($) {
    const listings = [];
    
    const selectors = [
      '.listing-item',
      '.result-card',
      '.directory-entry',
      '[role="listitem"]'
    ];
    
    for (const selector of selectors) {
      if ($(selector).length > 0) {
        $(selector).each((i, elem) => {
          const listing = {
            title: $(elem).find('h2, h3, h4, .title').first().text().trim(),
            link: $(elem).find('a').first().attr('href'),
            description: $(elem).find('p, .description').first().text().trim()
          };
          
          if (listing.title || listing.link) {
            listings.push(listing);
          }
        });
        break;
      }
    }
    
    return listings;
  }
  
  extractPagination($) {
    return {
      next: $('a[rel="next"]').attr('href') || $('.pagination .next').attr('href'),
      prev: $('a[rel="prev"]').attr('href') || $('.pagination .prev').attr('href'),
      current: $('.pagination .current').text().trim() || '1'
    };
  }
}

class GenericExtractor {
  extract(url, html) {
    const $ = cheerio.load(html);
    
    // Remove scripts and styles
    $('script, style, noscript').remove();
    
    return {
      url,
      title: $('title').text().trim(),
      content: this.extractMainContent($),
      headings: this.extractHeadings($),
      metadata: this.extractMetaTags($)
    };
  }
  
  extractMainContent($) {
    // Try to find main content area
    const mainSelectors = ['main', '#main', '.main', '#content', '.content', 'article'];
    
    for (const selector of mainSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        return element.text().trim().substring(0, 10000);
      }
    }
    
    // Fallback: get body text
    return $('body').text().trim().substring(0, 10000);
  }
  
  extractHeadings($) {
    const headings = [];
    
    $('h1, h2, h3').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text) {
        headings.push({
          level: elem.name,
          text: text.substring(0, 200)
        });
      }
    });
    
    return headings.slice(0, 20);
  }
  
  extractMetaTags($) {
    const meta = {};
    
    $('meta').each((i, elem) => {
      const name = $(elem).attr('name') || $(elem).attr('property');
      const content = $(elem).attr('content');
      
      if (name && content) {
        meta[name] = content.substring(0, 500);
      }
    });
    
    return meta;
  }
}

module.exports = ContentExtractor;