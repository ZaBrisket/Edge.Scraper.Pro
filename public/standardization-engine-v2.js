/**
 * Company Description Standardization Engine v2.0
 * Production-grade standardization with manual override support
 */

(function(window) {
  'use strict';

  // Comprehensive fluff patterns
  const PATTERNS = {
    FLUFF: /\b(leading|innovative|world[- ]?class|premier|top[- ]?tier|cutting[- ]?edge|award[- ]?winning|best[- ]in[- ]class|state[- ]of[- ]the[- ]art|trusted|global|next[- ]?gen|revolutionary|transformative|game[- ]?changing|unique|unparalleled|unrivaled|industry[- ]?leading|mission[- ]?critical|groundbreaking|pioneering)\b/gi,
    REVENUE: /(\$[\d,.]+\s*(million|billion|M|B|mm|bn|revenue|sales)|revenue\s+of|\b\d+M\s+in\s+revenue|\b\d+\s*\+?\s*(million|billion)\s+(in\s+)?(revenue|sales))/gi,
    PARTNERSHIP: /\b(partner(ship|s|ed|ing)?|alliance|reseller|channel\s+partner|collaborat(e|ion|ive|ing|ed)|joint\s+venture|strategic\s+relationship)\b/gi,
    GEO_BRAG: /\b(headquartered|based\s+in|global\s+presence|worldwide|nationwide|offices?\s+in|locations?\s+across|facilities?\s+in)\b/gi,
    INVESTOR: /\b(portfolio\s+company|backed\s+by|investor|funding|venture\s+capital|private\s+equity|series\s+[a-z])\b/gi,
    FOUNDING: /\b(founded\s+in\s+\d{4}|established\s+in\s+\d{4}|since\s+\d{4}|incorporated\s+in\s+\d{4}|over\s+\d+\+?\s+years)\b/gi,
    EMPLOYEES: /\b(\d+\+?\s+employees?|team\s+of\s+\d+|staff\s+of\s+\d+)\b/gi,
    MARKETING: /\b(commitment\s+to|dedicated\s+to|passionate\s+about|focused\s+on\s+delivering|striving\s+to)\b/gi
  };

  // Expanded deterministic verb map
  const VERB_RULES = [
    {pattern: /manufactur/i, verb: 'manufactures'},
    {pattern: /distribut|wholesale|resell/i, verb: 'distributes'},
    {pattern: /install|deploy|implement|commission/i, verb: 'installs'},
    {pattern: /develop|software|platform|application|system/i, verb: 'develops'},
    {pattern: /design|architect|engineer/i, verb: 'designs'},
    {pattern: /repair|fix|restore/i, verb: 'repairs'},
    {pattern: /maintain|maintenance|upkeep/i, verb: 'maintains'},
    {pattern: /service|support/i, verb: 'services'},
    {pattern: /test|inspect|evaluat|assess/i, verb: 'tests'},
    {pattern: /certif|accredit|validat/i, verb: 'certifies'},
    {pattern: /manag|operat|oversee|administr/i, verb: 'manages'},
    {pattern: /consult|advis/i, verb: 'provides consulting for'},
    {pattern: /integrat|implement/i, verb: 'integrates'},
    {pattern: /sell|retail/i, verb: 'sells'},
    {pattern: /specializ/i, verb: 'specializes in'}
  ];

  // Column synonyms with expanded coverage
  const COLUMN_SYNONYMS = {
    companyName: [
      'company name', 'company', 'name', 'organization', 'org name', 'legal name',
      'account name', 'firm', 'business name', 'entity', 'dba', 'informal name',
      'business', 'vendor', 'supplier', 'customer'
    ],
    website: [
      'website', 'company website', 'domain', 'url', 'homepage', 'web site',
      'company url', 'web address', 'site', 'linkedin website', 'profileurl'
    ],
    description: [
      'description', 'about', 'company description', 'business description',
      'profile', 'overview', 'summary', 'bio', 'about us', 'who we are',
      'long description', 'short description', 'details'
    ],
    specialties: [
      'specialties', 'specialty', 'capabilities', 'services', 'competencies',
      'focus areas', 'expertise', 'core competencies', 'key services',
      'service lines', 'practice areas', 'solutions'
    ],
    products: [
      'products and services', 'products & services', 'products/services',
      'offerings', 'solutions', 'product lines', 'service offerings',
      'products', 'what we offer'
    ],
    industries: [
      'industry', 'industries', 'sector', 'sectors', 'verticals', 'naics',
      'sic', 'market segment', 'business sector', 'naics description'
    ],
    endMarkets: [
      'end markets', 'markets', 'customer segments', 'target markets',
      'clients', 'customers', 'who we serve', 'client types'
    ]
  };

  // Two-part TLDs for domain parsing
  const TWO_PART_TLDS = new Set([
    'co.uk', 'ac.uk', 'gov.uk', 'org.uk', 'com.au', 'com.br', 'com.mx',
    'co.jp', 'co.in', 'com.cn', 'co.za', 'com.sg', 'com.hk', 'com.tr',
    'co.nz', 'co.id', 'co.kr', 'co.th', 'com.my', 'com.tw'
  ]);

  function normalizeColumnName(name) {
    return String(name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function stripLegalSuffix(name) {
    return String(name || '')
      .replace(/\b(inc\.?|llc|ltd\.?|corp\.?|co\.?|company|corporation|limited|incorporated)\b/gi, '')
      .replace(/[,.\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractNameFromDomain(url) {
    if (!url) return null;
    try {
      let clean = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      let domain = clean.split('/')[0].split('.')[0];
      
      // Handle two-part TLDs
      const parts = clean.split('/')[0].split('.');
      if (parts.length >= 3) {
        const lastTwo = parts.slice(-2).join('.');
        if (TWO_PART_TLDS.has(lastTwo)) {
          domain = parts[parts.length - 3];
        }
      }
      
      // Convert to proper case
      return domain
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(word => {
          // Preserve acronyms
          if (/^[A-Z]{2,5}$/.test(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
    } catch (e) {
      return null;
    }
  }

  function findColumn(headers, synonymList) {
    const normalizedHeaders = headers.map(h => ({
      original: h,
      normalized: normalizeColumnName(h)
    }));

    // Exact match
    for (const syn of synonymList) {
      const match = normalizedHeaders.find(h => h.normalized === syn);
      if (match) return match.original;
    }

    // Contains match
    for (const syn of synonymList) {
      const match = normalizedHeaders.find(h => 
        h.normalized.includes(syn) || syn.includes(h.normalized)
      );
      if (match) return match.original;
    }

    return null;
  }

  function detectEmbeddedHeader(rows) {
    // Check first 25 rows for header patterns
    const headerKeywords = new Set([
      'company name', 'website', 'description', 'specialties',
      'products and services', 'industries', 'end markets'
    ].map(normalizeColumnName));

    for (let i = 0; i < Math.min(25, rows.length); i++) {
      const values = Object.values(rows[i]).map(v => normalizeColumnName(v));
      const matches = values.filter(v => headerKeywords.has(v)).length;
      
      if (matches >= 3) {
        return i;
      }
    }
    return -1;
  }

  function stripPatterns(text) {
    if (!text) return '';
    
    let cleaned = text;
    
    // Remove each pattern category
    Object.values(PATTERNS).forEach(pattern => {
      cleaned = cleaned.replace(pattern, ' ');
    });
    
    // Clean up whitespace and punctuation
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '')
      .trim();
    
    return cleaned;
  }

  function splitSentences(text) {
    return text.split(/(?<=[.!?])\s+/).filter(s => s.length > 0);
  }

  function selectVerb(text, source) {
    const lowerText = text.toLowerCase();
    
    for (const rule of VERB_RULES) {
      if (rule.pattern.test(lowerText)) {
        return rule.verb;
      }
    }
    
    // Default based on source
    if (source === 'specialties') return 'specializes in';
    if (source === 'products') return 'provides';
    return 'provides';
  }

  function parseList(text, maxItems = 3) {
    if (!text) return [];
    
    // Split by common delimiters
    const items = text
      .split(/[;,•|\/]|\s+and\s+|\s+&\s+/)
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .filter((item, index, self) => 
        self.findIndex(i => i.toLowerCase() === item.toLowerCase()) === index
      );
    
    return items.slice(0, maxItems);
  }

  function joinList(items) {
    if (!items || items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  function enforceWordLimit(sentence, limit = 30) {
    const words = sentence.split(/\s+/);
    if (words.length <= limit) return sentence;
    
    // Try to end at punctuation if possible
    let truncated = words.slice(0, limit).join(' ');
    if (!truncated.endsWith('.')) {
      truncated = truncated.replace(/[,;:]?\s*$/, '') + '.';
    }
    return truncated;
  }

  function standardizeDescription(row, columnMap) {
    // Extract all fields
    const companyName = stripLegalSuffix(row[columnMap.companyName] || '');
    const website = row[columnMap.website] || '';
    const description = row[columnMap.description] || '';
    const specialties = row[columnMap.specialties] || '';
    const products = row[columnMap.products] || '';
    const industries = row[columnMap.industries] || '';
    const endMarkets = row[columnMap.endMarkets] || '';

    // Determine company name
    const name = companyName || extractNameFromDomain(website) || 'Company';

    // Select and clean primary content
    let primaryContent = '';
    let contentSource = '';
    
    if (description && description.length > 20) {
      primaryContent = stripPatterns(description);
      contentSource = 'description';
    } else if (specialties) {
      primaryContent = stripPatterns(specialties);
      contentSource = 'specialties';
    } else if (products) {
      primaryContent = stripPatterns(products);
      contentSource = 'products';
    }

    // Handle empty content
    if (!primaryContent || primaryContent.length < 10) {
      const fallbackIndustry = (industries || endMarkets || 'industry')
        .split(/[;,]/)[0]
        .trim()
        .toLowerCase();
      return enforceWordLimit(
        `${name} provides ${fallbackIndustry}-related services (details not specified).`
      );
    }

    // Extract first sentence only
    const firstSentence = splitSentences(primaryContent)[0] || primaryContent;

    // Build offering phrase
    let offering = '';
    if (contentSource === 'specialties' || contentSource === 'products') {
      const items = parseList(firstSentence);
      offering = joinList(items) || firstSentence;
    } else {
      // Remove company name and common prefixes
      offering = firstSentence
        .replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(is|provides|offers|specializes in)\\s+`, 'i'), '')
        .replace(/^(we|our company|the company)\s+/i, '')
        .trim();
    }

    // Select verb
    const verb = selectVerb(primaryContent, contentSource);

    // Add market context (optional, max 2 items)
    let context = '';
    const contextSource = industries || endMarkets;
    if (contextSource) {
      const contextItems = parseList(contextSource, 2);
      if (contextItems.length > 0) {
        context = ` for ${joinList(contextItems)}`;
      }
    }

    // Construct final summary
    let summary = `${name} ${verb} ${offering}${context}.`;
    
    // Clean up formatting
    summary = summary
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .replace(/\.+$/, '.')
      .trim();

    // Enforce word limit (prefer without context if too long)
    if (summary.split(/\s+/).length > 30 && context) {
      const withoutContext = `${name} ${verb} ${offering}.`;
      if (withoutContext.split(/\s+/).length <= 30) {
        summary = withoutContext;
      } else {
        summary = enforceWordLimit(summary);
      }
    } else {
      summary = enforceWordLimit(summary);
    }

    return summary;
  }

  // Public API functions
  function prepare(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return {
        success: false,
        headers: [],
        rows: [],
        columnMap: {},
        messages: ['No data to process']
      };
    }

    // Detect and handle embedded headers
    const headerIndex = detectEmbeddedHeader(records);
    let dataRows = records;
    let headers = Object.keys(records[0]);

    if (headerIndex >= 0) {
      // Promote embedded header
      headers = Object.values(records[headerIndex]);
      dataRows = records.slice(headerIndex + 1).map(row => {
        const newRow = {};
        const values = Object.values(row);
        headers.forEach((header, i) => {
          newRow[header] = values[i] || '';
        });
        return newRow;
      });
    }

    // Auto-map columns
    const columnMap = {
      companyName: findColumn(headers, COLUMN_SYNONYMS.companyName),
      website: findColumn(headers, COLUMN_SYNONYMS.website),
      description: findColumn(headers, COLUMN_SYNONYMS.description),
      specialties: findColumn(headers, COLUMN_SYNONYMS.specialties),
      products: findColumn(headers, COLUMN_SYNONYMS.products),
      industries: findColumn(headers, COLUMN_SYNONYMS.industries),
      endMarkets: findColumn(headers, COLUMN_SYNONYMS.endMarkets)
    };

    // Generate messages
    const messages = [];
    if (!columnMap.companyName && !columnMap.website) {
      messages.push('Warning: No company name or website column found');
    }
    if (!columnMap.description && !columnMap.specialties && !columnMap.products) {
      messages.push('Warning: No content columns found (description/specialties/products)');
    }

    return {
      success: true,
      headers: headers,
      rows: dataRows,
      columnMap: columnMap,
      messages: messages
    };
  }

  function summarize(prepared, overrides = {}) {
    const { rows, columnMap } = prepared;
    const finalMap = Object.assign({}, columnMap, overrides);
    
    return rows.map(row => ({
      'Company Name': row[finalMap.companyName] || extractNameFromDomain(row[finalMap.website]) || '',
      'Website': row[finalMap.website] || '',
      'Original Description': row[finalMap.description] || '',
      'Summary': standardizeDescription(row, finalMap)
    }));
  }

  // Export public API
  window.StandardizationEngineV2 = {
    prepare: prepare,
    summarize: summarize,
    // Expose utilities for testing
    _utils: {
      stripLegalSuffix: stripLegalSuffix,
      extractNameFromDomain: extractNameFromDomain,
      stripPatterns: stripPatterns,
      enforceWordLimit: enforceWordLimit
    }
  };

})(window);