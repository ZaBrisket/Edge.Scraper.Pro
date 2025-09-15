const natural = require('natural');
const compromise = require('compromise');
const cheerio = require('cheerio');

class MANewsExtractor {
  constructor() {
    // Deal value extraction patterns
    this.dealValuePatterns = [
      /\$[\d,]+\.?\d*\s*(billion|million|M|B)/gi,
      /USD\s*[\d,]+\.?\d*\s*(billion|million)/gi,
      /valued at\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /consideration of\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /worth\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /for\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /approximately\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /transaction valued at\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi
    ];

    // Transaction type keywords
    this.transactionTypes = {
      'merger': ['merge', 'merging', 'merged', 'merger', 'combination', 'combine'],
      'acquisition': ['acquire', 'acquiring', 'acquired', 'acquisition', 'purchase', 'purchased', 'buy', 'bought', 'takeover'],
      'divestiture': ['divest', 'divesting', 'divested', 'divestiture', 'sell', 'selling', 'sold', 'disposal', 'spin-off'],
      'joint_venture': ['joint venture', 'JV', 'partnership', 'strategic alliance', 'collaboration'],
      'investment': ['invest', 'investment', 'investing', 'stake', 'equity', 'funding', 'capital']
    };

    // Date extraction patterns
    this.datePatterns = [
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/gi
    ];

    // Company identifier patterns
    this.companyPatterns = [
      /(?:^|\s)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:Inc\.|LLC|Corp\.|Corporation|Limited|Ltd\.|Company|Co\.|Group|Holdings|Partners|LP|LLP)/g,
      /(?:acquires?|acquired by|merges? with|to acquire|will acquire|has acquired|buys?|bought by)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acquires?|to acquire|will acquire|has acquired|announces acquisition)/g,
      /(?:^|\s)([A-Z][A-Za-z]+(?:\s+&\s+[A-Z][A-Za-z]+)+)/g
    ];
  }

  extractFromHTML(html, url = '') {
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Extract text content
    const textContent = $('body').text()
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
    
    // Extract title
    const title = $('h1').first().text().trim() || 
                 $('title').text().trim() || 
                 $('[class*="title"]').first().text().trim();
    
    // Extract main content areas
    const articleContent = $('article, [class*="article"], [class*="content"], main').text().trim() || textContent;
    
    return {
      url: url,
      title: title,
      dealValue: this.extractDealValue(articleContent),
      transactionType: this.extractTransactionType(articleContent),
      companies: this.extractCompanies(articleContent),
      dates: this.extractDates(articleContent),
      advisors: this.extractAdvisors(articleContent),
      executiveQuotes: this.extractQuotes(articleContent),
      summary: this.generateSummary(articleContent),
      confidence: this.calculateConfidence(articleContent),
      textContent: articleContent.substring(0, 5000),
      extractedAt: new Date().toISOString()
    };
  }

  extractDealValue(text) {
    const values = [];
    
    for (const pattern of this.dealValuePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = this.normalizeDealValue(match);
          if (normalized && !values.find(v => v.normalized === normalized.normalized)) {
            values.push(normalized);
          }
        });
      }
    }
    
    // Sort by value descending and return the highest
    values.sort((a, b) => b.normalized - a.normalized);
    return values.length > 0 ? values[0] : null;
  }

  normalizeDealValue(valueStr) {
    const match = valueStr.match(/([\d,]+\.?\d*)\s*(billion|million|B|M)/i);
    if (!match) return null;
    
    const number = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2].toLowerCase();
    
    if (isNaN(number)) return null;
    
    let multiplier = 1;
    if (unit === 'billion' || unit === 'b') multiplier = 1000000000;
    else if (unit === 'million' || unit === 'm') multiplier = 1000000;
    
    return {
      raw: valueStr,
      normalized: number * multiplier,
      display: `$${number.toFixed(1)} ${unit === 'b' || unit === 'billion' ? 'billion' : 'million'}`,
      confidence: 0.9
    };
  }

  extractTransactionType(text) {
    const lowerText = text.toLowerCase();
    const detectedTypes = [];
    
    for (const [type, keywords] of Object.entries(this.transactionTypes)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          detectedTypes.push({ type, keyword, count: (lowerText.match(new RegExp(keyword, 'g')) || []).length });
        }
      }
    }
    
    // Return the type with the most mentions
    if (detectedTypes.length > 0) {
      detectedTypes.sort((a, b) => b.count - a.count);
      return detectedTypes[0].type;
    }
    
    return 'unknown';
  }

  extractCompanies(text) {
    const doc = compromise(text);
    const nlpOrgs = doc.organizations().out('array');
    
    const companies = new Set();
    
    // Add NLP-detected organizations
    nlpOrgs.forEach(org => {
      if (org && org.length > 2 && !this.isCommonWord(org)) {
        companies.add(org);
      }
    });
    
    // Add pattern-matched companies
    this.companyPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const company = match[1];
        if (company && company.length > 2 && !this.isCommonWord(company)) {
          companies.add(company.trim());
        }
      }
    });
    
    // Clean and filter results
    const cleanCompanies = Array.from(companies)
      .filter(c => c.length > 2 && c.length < 100)
      .slice(0, 10);
    
    return cleanCompanies;
  }

  extractDates(text) {
    const dates = [];
    const seen = new Set();
    
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!seen.has(match)) {
            seen.add(match);
            try {
              const parsedDate = new Date(match);
              if (!isNaN(parsedDate.getTime())) {
                dates.push({
                  raw: match,
                  parsed: parsedDate.toISOString().split('T')[0],
                  timestamp: parsedDate.getTime()
                });
              }
            } catch (e) {
              // Skip invalid dates
            }
          }
        });
      }
    }
    
    // Sort by timestamp descending
    dates.sort((a, b) => b.timestamp - a.timestamp);
    return dates.slice(0, 5);
  }

  extractAdvisors(text) {
    const advisorPatterns = [
      /(?:advised by|advisor to|financial advisor|legal advisor|legal counsel)\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acted as|served as|is acting as|will act as)\s+(?:financial advisor|legal counsel|advisor)/g,
      /(?:Goldman Sachs|Morgan Stanley|J\.?P\.? Morgan|Bank of America|Citigroup|Credit Suisse|Deutsche Bank|Barclays|UBS|Lazard|Evercore|Centerview|Rothschild|Jefferies)/gi
    ];
    
    const advisors = new Set();
    
    advisorPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const advisor = match[1] || match[0];
        if (advisor && advisor.length > 2) {
          advisors.add(advisor.trim());
        }
      }
    });
    
    return Array.from(advisors).slice(0, 10);
  }

  extractQuotes(text) {
    const quotePatterns = [
      /"([^"]{20,500})"\s*(?:said|says?|stated?|commented?|added?|noted?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:,\s*[^,]+,)?\s+(?:said|says?|stated?|commented?|added?|noted?)[:\s]+"([^"]{20,500})"/g,
      /"([^"]{20,500})"/g
    ];
    
    const quotes = [];
    const seenQuotes = new Set();
    
    quotePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const quote = match[1] || match[2];
        const speaker = match[2] || match[1] || 'Executive';
        
        if (quote && !seenQuotes.has(quote.substring(0, 50))) {
          seenQuotes.add(quote.substring(0, 50));
          quotes.push({
            quote: quote.trim(),
            speaker: typeof speaker === 'string' ? speaker.trim() : 'Executive'
          });
        }
      }
    });
    
    return quotes.slice(0, 5);
  }

  generateSummary(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const relevantSentences = sentences.filter(s => 
      /acquire|merger|acquisition|deal|transaction|billion|million/i.test(s)
    );
    
    const summary = (relevantSentences.length > 0 ? relevantSentences : sentences)
      .slice(0, 3)
      .join(' ')
      .substring(0, 500);
    
    return summary;
  }

  calculateConfidence(text) {
    let score = 0;
    
    // Check for deal value
    if (this.extractDealValue(text)) score += 30;
    
    // Check for transaction type
    if (this.extractTransactionType(text) !== 'unknown') score += 25;
    
    // Check for companies
    const companies = this.extractCompanies(text);
    if (companies.length >= 2) score += 25;
    else if (companies.length === 1) score += 15;
    
    // Check for dates
    if (this.extractDates(text).length > 0) score += 20;
    
    return Math.min(score, 100);
  }

  isCommonWord(word) {
    const common = ['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For'];
    return common.includes(word);
  }
}

module.exports = MANewsExtractor;