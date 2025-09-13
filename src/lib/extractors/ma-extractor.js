const natural = require('natural');
const compromise = require('compromise');
const { parse } = require('date-fns');

class MAExtractor {
  constructor() {
    this.dealValuePatterns = [
      /\$[\d,]+\.?\d*\s*(billion|million|M|B)/gi,
      /USD\s*[\d,]+\.?\d*\s*(billion|million)/gi,
      /valued at\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /consideration of\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /price of\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi,
      /for\s*\$?[\d,]+\.?\d*\s*(billion|million)/gi
    ];

    this.transactionTypes = {
      'merger': ['merge', 'merging', 'merged', 'merger'],
      'acquisition': ['acquire', 'acquiring', 'acquired', 'acquisition', 'purchase', 'purchased', 'buy', 'bought'],
      'divestiture': ['divest', 'divesting', 'divested', 'divestiture', 'sell', 'selling', 'sold'],
      'joint_venture': ['joint venture', 'JV', 'partnership', 'strategic alliance'],
      'investment': ['invest', 'investment', 'investing', 'stake', 'equity']
    };

    this.datePatterns = [
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g
    ];
  }

  extractDealValue(text) {
    const values = [];
    for (const pattern of this.dealValuePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const value = this.normalizeDealValue(match);
          if (value) values.push(value);
        });
      }
    }
    return values.length > 0 ? values[0] : null;
  }

  normalizeDealValue(valueStr) {
    const match = valueStr.match(/([\d,]+\.?\d*)\s*(billion|million|B|M)/i);
    if (!match) return null;
    
    const number = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2].toLowerCase();
    
    let multiplier = 1;
    if (unit === 'billion' || unit === 'b') multiplier = 1000000000;
    else if (unit === 'million' || unit === 'm') multiplier = 1000000;
    
    return {
      raw: valueStr,
      normalized: number * multiplier,
      display: `$${number} ${unit === 'b' ? 'billion' : unit === 'm' ? 'million' : unit}`
    };
  }

  extractTransactionType(text) {
    const lowercaseText = text.toLowerCase();
    for (const [type, keywords] of Object.entries(this.transactionTypes)) {
      for (const keyword of keywords) {
        if (lowercaseText.includes(keyword)) {
          return type;
        }
      }
    }
    return 'unknown';
  }

  extractCompanies(text) {
    const doc = compromise(text);
    const organizations = doc.organizations().out('array');
    
    // Enhanced company extraction patterns
    const companyPatterns = [
      /(?:^|\s)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:Inc\.|LLC|Corp\.|Corporation|Limited|Ltd\.|Company|Co\.|Group|Holdings)/g,
      /(?:acquires?|acquired by|merges? with|to acquire|will acquire|has acquired)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acquires?|to acquire|will acquire|has acquired)/g
    ];

    const companies = new Set(organizations);
    
    companyPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          companies.add(match[1].trim());
        }
      }
    });

    return Array.from(companies).filter(c => 
      c.length > 2 && 
      !['The', 'This', 'That', 'These', 'Those'].includes(c)
    );
  }

  extractDates(text) {
    const dates = [];
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          try {
            const parsedDate = new Date(match);
            if (!isNaN(parsedDate.getTime())) {
              dates.push({
                raw: match,
                parsed: parsedDate.toISOString().split('T')[0]
              });
            }
          } catch (e) {
            // Skip invalid dates
          }
        });
      }
    }
    return dates;
  }

  extractExecutiveQuotes(text) {
    const quotePatterns = [
      /"([^"]+)"\s*(?:said|says?|stated?|commented?|added?)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/g,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:,\s*[^,]+,)?\s+(?:said|says?|stated?|commented?|added?)[:\s]+"([^"]+)"/g
    ];

    const quotes = [];
    quotePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        quotes.push({
          quote: match[1] || match[2],
          speaker: match[2] || match[1]
        });
      }
    });
    return quotes;
  }

  extractAdvisors(text) {
    const advisorPatterns = [
      /(?:advised by|advisor to|financial advisor|legal advisor|counsel)\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:acted as|served as|is acting as)\s+(?:financial advisor|legal counsel|advisor)/g
    ];

    const advisors = new Set();
    advisorPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) advisors.add(match[1].trim());
      }
    });
    return Array.from(advisors);
  }

  extract(html, text) {
    const cleanText = text || this.extractTextFromHTML(html);
    
    return {
      dealValue: this.extractDealValue(cleanText),
      transactionType: this.extractTransactionType(cleanText),
      companies: this.extractCompanies(cleanText),
      dates: this.extractDates(cleanText),
      executiveQuotes: this.extractExecutiveQuotes(cleanText),
      advisors: this.extractAdvisors(cleanText),
      summary: this.generateSummary(cleanText),
      confidence: this.calculateConfidence(cleanText)
    };
  }

  extractTextFromHTML(html) {
    // Remove script and style elements
    const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    // Extract text
    return cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  generateSummary(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').substring(0, 500);
  }

  calculateConfidence(text) {
    let score = 0;
    if (this.extractDealValue(text)) score += 25;
    if (this.extractTransactionType(text) !== 'unknown') score += 25;
    if (this.extractCompanies(text).length >= 2) score += 25;
    if (this.extractDates(text).length > 0) score += 25;
    return score;
  }
}

module.exports = MAExtractor;