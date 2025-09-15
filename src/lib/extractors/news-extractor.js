/**
 * Universal content extractor for M&A news and PR releases
 */

const cheerio = require('cheerio');
const { getSiteProfile } = require('../http/site-profiles');

class NewsExtractor {
  /**
   * Extract content from any news site
   */
  extractContent(html, url) {
    const $ = cheerio.load(html);
    const siteProfile = getSiteProfile(url);
    
    // Remove unwanted elements
    this.cleanDOM($);
    
    // Try site-specific selectors first
    const extracted = this.trySelectors($, siteProfile.selectors);
    
    if (extracted.content) {
      return this.formatResult(extracted, url, siteProfile);
    }
    
    // Fallback to intelligent extraction
    return this.intelligentExtraction($, url);
  }

  /**
   * Try site-specific selectors
   */
  trySelectors($, selectors) {
    const result = {};
    
    // Extract content
    if (selectors.content) {
      for (const selector of selectors.content) {
        const element = $(selector).first();
        if (element.length) {
          result.content = this.cleanText(element.text());
          result.contentHtml = element.html();
          break;
        }
      }
    }
    
    // Extract title
    if (selectors.title) {
      for (const selector of selectors.title) {
        const element = $(selector).first();
        if (element.length) {
          result.title = this.cleanText(element.text());
          break;
        }
      }
    }
    
    // Extract date
    if (selectors.date) {
      for (const selector of selectors.date) {
        const element = $(selector).first();
        if (element.length) {
          result.date = this.parseDate(element.text() || element.attr('datetime'));
          break;
        }
      }
    }
    
    return result;
  }

  /**
   * Intelligent content extraction using heuristics
   */
  intelligentExtraction($, url) {
    // Find main content using various heuristics
    const candidates = [];
    
    // Check for article tags
    $('article, [role="article"], .article, #article').each((i, elem) => {
      candidates.push({
        element: $(elem),
        score: this.scoreContent($(elem))
      });
    });
    
    // Check main content areas
    $('main, [role="main"], .main-content, #main-content').each((i, elem) => {
      candidates.push({
        element: $(elem),
        score: this.scoreContent($(elem)) * 0.9
      });
    });
    
    // Sort by score and get best candidate
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0 && candidates[0].score > 100) {
      const bestCandidate = candidates[0].element;
      
      return {
        content: this.cleanText(bestCandidate.text()),
        contentHtml: bestCandidate.html(),
        title: $('h1').first().text() || $('title').text(),
        date: this.findDate($),
        url,
        extractionMethod: 'intelligent',
        confidence: Math.min(candidates[0].score / 500, 1)
      };
    }
    
    // Last resort: get all paragraphs
    const paragraphs = [];
    $('p').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 50) {
        paragraphs.push(text);
      }
    });
    
    return {
      content: paragraphs.join('\n\n'),
      title: $('h1').first().text() || $('title').text(),
      date: this.findDate($),
      url,
      extractionMethod: 'fallback',
      confidence: 0.3
    };
  }

  /**
   * Score content based on various factors
   */
  scoreContent($elem) {
    let score = 0;
    
    // Text length
    const textLength = $elem.text().length;
    score += Math.min(textLength / 10, 100);
    
    // Paragraph count
    const paragraphCount = $elem.find('p').length;
    score += paragraphCount * 5;
    
    // Link density (lower is better)
    const linkText = $elem.find('a').text().length;
    const linkDensity = linkText / Math.max(textLength, 1);
    score -= linkDensity * 50;
    
    // Presence of article indicators
    const indicators = ['article', 'content', 'body', 'main', 'post', 'entry'];
    const classAndId = ($elem.attr('class') || '') + ' ' + ($elem.attr('id') || '');
    indicators.forEach(indicator => {
      if (classAndId.toLowerCase().includes(indicator)) {
        score += 20;
      }
    });
    
    // Penalize navigation, footer, sidebar
    const negative = ['nav', 'footer', 'sidebar', 'menu', 'comment', 'advertisement'];
    negative.forEach(neg => {
      if (classAndId.toLowerCase().includes(neg)) {
        score -= 50;
      }
    });
    
    return score;
  }

  /**
   * Clean DOM by removing unwanted elements
   */
  cleanDOM($) {
    // Remove script and style tags
    $('script, style, noscript').remove();
    
    // Remove navigation, footer, etc.
    $('nav, footer, aside, .navigation, .footer, .sidebar, .advertisement').remove();
    
    // Remove hidden elements
    $('[style*="display:none"], [style*="visibility:hidden"], .hidden').remove();
    
    // Remove comments section
    $('.comments, #comments, .disqus, #disqus').remove();
  }

  /**
   * Clean extracted text
   */
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Find date in various formats
   */
  findDate($) {
    // Try meta tags
    const metaDate = $('meta[property="article:published_time"], meta[name="publish_date"]').attr('content');
    if (metaDate) return this.parseDate(metaDate);
    
    // Try time tags
    const timeTag = $('time[datetime]').first().attr('datetime');
    if (timeTag) return this.parseDate(timeTag);
    
    // Try JSON-LD
    const jsonLd = $('script[type="application/ld+json"]').text();
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        if (data.datePublished) return this.parseDate(data.datePublished);
      } catch (e) {}
    }
    
    return null;
  }

  /**
   * Parse date string
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch (e) {
      return null;
    }
  }

  /**
   * Format final result
   */
  formatResult(extracted, url, siteProfile) {
    return {
      url,
      title: extracted.title || '',
      content: extracted.content || '',
      contentHtml: extracted.contentHtml || '',
      date: extracted.date,
      site: siteProfile.hostname,
      category: siteProfile.category,
      extractionMethod: 'site-specific',
      confidence: 0.9,
      metadata: {
        wordCount: (extracted.content || '').split(/\s+/).length,
        hasPaywall: this.detectPaywall(extracted.contentHtml || extracted.content),
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Detect paywall
   */
  detectPaywall(content) {
    const paywallIndicators = [
      'subscribe to read',
      'subscription required',
      'members only',
      'premium content',
      'unlock this article',
      'continue reading with subscription'
    ];
    
    const lowerContent = (content || '').toLowerCase();
    return paywallIndicators.some(indicator => lowerContent.includes(indicator));
  }
}

module.exports = new NewsExtractor();