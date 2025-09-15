/**
 * Company Description Standardization Engine
 * Generates concise, factual company descriptions from raw data
 * @module DescriptionStandardizer
 */

const DescriptionStandardizer = (function() {
  'use strict';

  // Configuration
  const CONFIG = {
    MAX_WORD_COUNT: 30,
    MIN_WORD_COUNT: 10,
    // Industry-specific acronyms to preserve
    PRESERVE_ACRONYMS: new Set([
      // Tech/Software
      'AI', 'ML', 'API', 'SaaS', 'PaaS', 'IaaS', 'IoT', 'ERP', 'CRM', 'HCM',
      'B2B', 'B2C', 'D2C', 'SDK', 'UI', 'UX', 'SEO', 'SEM', 'CMS', 'CDN',
      
      // Finance/Insurance
      'P&C', 'L&H', 'TPO', 'TPA', 'MGA', 'MGU', 'BPO', 'RPA', 'IPO', 'M&A',
      'PE', 'VC', 'LP', 'GP', 'IRR', 'ROI', 'EBITDA', 'P&L', 'CFO', 'CEO',
      
      // Healthcare/Medical
      'FDA', 'HIPAA', 'EMR', 'EHR', 'PHI', 'PBM', 'DME', 'PPO', 'HMO', 'EPO',
      'IPA', 'ACO', 'SNF', 'LTAC', 'IRF', 'ASC', 'FQHC', 'RCM', 'HIE',
      
      // Manufacturing/Industrial
      'OEM', 'MRO', 'SKU', 'BOM', 'QC', 'QA', 'ISO', 'LEAN', 'JIT', 'ETO',
      'MTO', 'MTS', 'WIP', 'COGS', 'SOP', 'PLM', 'MES', 'SCADA', 'PLC',
      
      // Construction/Real Estate
      'HVAC', 'MEP', 'GC', 'LEED', 'BIM', 'CAD', 'AEC', 'RFI', 'RFP', 'RFQ',
      'REIT', 'NOI', 'CAP', 'IRR', 'NPV', 'LTV', 'DSC', 'TI',
      
      // Government/Defense
      'DoD', 'DHS', 'FBI', 'CIA', 'NSA', 'FEMA', 'GSA', 'SBA', 'FTC', 'SEC',
      'NAICS', 'CAGE', 'DUNS', 'SAM', 'DCAA', 'DCMA', 'ITAR', 'EAR',
      
      // Logistics/Transportation
      'LTL', 'FTL', 'TL', 'FCL', 'LCL', 'EDI', 'WMS', 'TMS', 'YMS', '3PL',
      '4PL', 'DC', 'RFID', 'GPS', 'ETA', 'ETD', 'BOL', 'POD'
    ]),
    
    // Primary action verbs by category
    VERB_TAXONOMY: {
      // Service providers
      service: ['provides', 'delivers', 'offers', 'supplies'],
      specialist: ['specializes in', 'focuses on'],
      
      // Product companies
      manufacturing: ['manufactures', 'produces', 'fabricates', 'develops'],
      distribution: ['distributes', 'supplies', 'sells'],
      
      // Professional services
      consulting: ['advises', 'consults on', 'guides'],
      management: ['manages', 'operates', 'administers', 'oversees'],
      
      // Technical services
      maintenance: ['maintains', 'services', 'repairs', 'supports'],
      installation: ['installs', 'implements', 'deploys', 'integrates'],
      
      // Platform/Software
      platform: ['enables', 'facilitates', 'automates', 'streamlines'],
      software: ['develops', 'builds', 'creates']
    },
    
    // Marketing fluff to remove
    REMOVE_PATTERNS: [
      // Superlatives
      /\b(leading|premier|best-in-class|top|innovative|cutting-edge|revolutionary|award-winning|world-class|industry-leading|state-of-the-art|exceptional|unparalleled)\b/gi,
      
      // Vague quality claims
      /\b(high-quality|highest quality|superior|excellence|exceptional|outstanding)\b/gi,
      
      // Time-based claims
      /\b(over \d+ years?|since \d{4}|established in \d{4}|founded in \d{4}|\d+ years of experience)\b/gi,
      
      // Geographic superlatives (unless listing specific service areas)
      /\b(nationwide|global|worldwide|international|across the nation|throughout)\b/gi,
      
      // Meta language
      /\b(their offerings include|services comprise|the company|they provide|we offer|our services)\b/gi,
      
      // Partnership mentions
      /\b(in partnership with|partnered with|strategic partner|preferred partner)\b/gi,
      
      // Revenue/size indicators
      /\b(\$[\d,]+(?:K|M|B)?(?:\s+in)?(?:\s+annual)?\s+(?:revenue|sales)|billion dollar|million dollar)\b/gi,
      
      // Commitment phrases
      /\b(committed to|dedicated to|focused on providing|passionate about)\b/gi
    ],
    
    // Industry detection patterns
    INDUSTRY_PATTERNS: {
      insurance: /\b(insurance|brokerage|underwriting|claims|actuarial|reinsurance|P&C|MGA|TPA)\b/i,
      healthcare: /\b(healthcare|medical|hospital|clinic|patient|clinical|pharmaceutical|biotech)\b/i,
      technology: /\b(software|technology|digital|platform|cloud|SaaS|data|analytics|AI|ML)\b/i,
      manufacturing: /\b(manufactur|production|industrial|factory|assembly|fabricat)\b/i,
      construction: /\b(construction|building|contractor|engineering|architect|infrastructure)\b/i,
      finance: /\b(financial|banking|investment|capital|fund|equity|lending|payment)\b/i,
      logistics: /\b(logistics|transportation|shipping|freight|supply chain|distribution|warehousing)\b/i,
      retail: /\b(retail|e-commerce|consumer|shopping|merchandise|store)\b/i,
      energy: /\b(energy|oil|gas|renewable|solar|wind|utility|power|electric)\b/i,
      realestate: /\b(real estate|property|REIT|commercial|residential|development|leasing)\b/i
    }
  };

  /**
   * Detect the primary industry from text
   */
  function detectIndustry(description, specialties, industries) {
    const combinedText = [description, specialties, industries].join(' ').toLowerCase();
    
    for (const [industry, pattern] of Object.entries(CONFIG.INDUSTRY_PATTERNS)) {
      if (pattern.test(combinedText)) {
        return industry;
      }
    }
    
    return 'general';
  }

  /**
   * Select appropriate verb based on context
   */
  function selectVerb(description, specialties, industry) {
    const text = (description + ' ' + specialties).toLowerCase();
    
    // Check for specific verb indicators
    if (/\b(manufact|produc|fabricat|assembl)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.manufacturing);
    }
    
    if (/\b(distribut|wholesal|retail|sell)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.distribution);
    }
    
    if (/\b(consult|advis|strateg)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.consulting);
    }
    
    if (/\b(manag|operat|administr|oversee)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.management);
    }
    
    if (/\b(maintain|service|repair|support)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.maintenance);
    }
    
    if (/\b(install|implement|deploy|integrat)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.installation);
    }
    
    if (/\b(platform|automat|streamlin|enabl)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.platform);
    }
    
    if (/\b(software|application|app|system|tool)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.software);
    }
    
    if (/\b(specializ|focus|expert|dedicat)\b/i.test(text)) {
      return getRandomFromArray(CONFIG.VERB_TAXONOMY.specialist);
    }
    
    // Default to service verbs
    return getRandomFromArray(CONFIG.VERB_TAXONOMY.service);
  }

  /**
   * Get random item from array (for variety)
   */
  function getRandomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Extract key offerings from specialties or description
   */
  function extractKeyOfferings(specialties, description) {
    const offerings = [];
    
    // First try to extract from specialties (comma-separated)
    if (specialties && specialties.trim()) {
      const items = specialties.split(/[,;]/)
        .map(s => s.trim())
        .filter(s => s.length > 2 && s.length < 50)
        .filter(s => !CONFIG.REMOVE_PATTERNS.some(p => p.test(s)));
      
      // Take first 3-4 most specific items
      offerings.push(...items.slice(0, 4));
    }
    
    // If not enough from specialties, extract from description
    if (offerings.length < 2 && description) {
      // Look for lists in description (items separated by commas, "and", etc.)
      const matches = description.match(/\b(?:including|such as|like|provides?|offers?)\s*:?\s*([^.]+)/i);
      if (matches && matches[1]) {
        const items = matches[1].split(/,\s*|\s+and\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 2 && s.length < 30)
          .slice(0, 3);
        offerings.push(...items);
      }
    }
    
    // Deduplicate and limit
    return [...new Set(offerings)].slice(0, 3);
  }

  /**
   * Extract target market from description or end markets
   */
  function extractTargetMarket(description, endMarkets) {
    const markets = [];
    
    // First check end markets field
    if (endMarkets && endMarkets.trim()) {
      const items = endMarkets.split(/[,;]/)
        .map(s => s.trim())
        .filter(s => s.length > 2 && s.length < 30);
      markets.push(...items.slice(0, 2));
    }
    
    // Look for market indicators in description
    if (markets.length === 0 && description) {
      const marketPatterns = [
        /\bserving\s+([^,.]+)/i,
        /\bfor\s+(businesses|companies|organizations|enterprises|hospitals|clinics|manufacturers|retailers)/i,
        /\bto\s+(businesses|companies|organizations|enterprises|hospitals|clinics|manufacturers|retailers)/i,
        /\b(B2B|B2C|enterprise|mid-market|SMB|small business)/i
      ];
      
      for (const pattern of marketPatterns) {
        const match = description.match(pattern);
        if (match && match[1]) {
          markets.push(match[1].trim());
          break;
        }
      }
    }
    
    return markets.slice(0, 2);
  }

  /**
   * Clean and normalize text
   */
  function cleanText(text) {
    if (!text) return '';
    
    // Remove marketing fluff
    let cleaned = text;
    for (const pattern of CONFIG.REMOVE_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Remove empty parentheses or brackets
    cleaned = cleaned.replace(/\(\s*\)/g, '');
    cleaned = cleaned.replace(/\[\s*\]/g, '');
    
    // Fix spacing around punctuation
    cleaned = cleaned.replace(/\s+([,.])/g, '$1');
    cleaned = cleaned.replace(/\s*,\s*/g, ', ');
    
    // Preserve acronyms
    cleaned = cleaned.replace(/\b([A-Z]{2,})\b/g, (match) => {
      return CONFIG.PRESERVE_ACRONYMS.has(match.toUpperCase()) ? match.toUpperCase() : match;
    });
    
    return cleaned.trim();
  }

  /**
   * Get company name from various sources
   */
  function extractCompanyName(companyName, informalName, website, description) {
    // Prefer informal name if available
    if (informalName && informalName.trim() && informalName !== companyName) {
      return cleanCompanyName(informalName);
    }
    
    // Use formal company name
    if (companyName && companyName.trim()) {
      return cleanCompanyName(companyName);
    }
    
    // Try to extract from description
    if (description) {
      const match = description.match(/^([A-Z][A-Za-z0-9\s&.,-]+)(?:\s+is\s+|\s+provides?\s+|\s+offers?\s+|\s+specializes?\s+)/);
      if (match && match[1]) {
        return cleanCompanyName(match[1]);
      }
    }
    
    // Derive from website domain as last resort
    if (website) {
      const domain = extractDomain(website);
      if (domain) {
        // Remove TLD and common prefixes
        let name = domain
          .replace(/\.(com|net|org|io|co|ai|app|dev|biz|info).*$/i, '')
          .replace(/^(www\.|app\.|portal\.|my\.)/i, '')
          .replace(/[-_]/g, ' ');
        
        // Title case
        name = name.replace(/\b\w/g, l => l.toUpperCase());
        
        return name;
      }
    }
    
    return 'The company';
  }

  /**
   * Clean company name
   */
  function cleanCompanyName(name) {
    return name
      .replace(/\s*\(.+?\)\s*$/g, '') // Remove trailing parenthetical
      .replace(/\s*dba\s+.+$/i, '') // Remove DBA
      .replace(/\s*,?\s*(Inc\.?|LLC|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|LP|LLP|Group|Partners)\.?\s*$/gi, '')
      .trim();
  }

  /**
   * Extract domain from website URL
   */
  function extractDomain(url) {
    if (!url) return '';
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      const urlObj = new URL(fullUrl);
      let hostname = urlObj.hostname.toLowerCase();
      if (hostname.startsWith('www.')) {
        hostname = hostname.slice(4);
      }
      return hostname;
    } catch {
      const cleaned = url.toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '');
      return cleaned.split('/')[0] || '';
    }
  }

  /**
   * Count words in text
   */
  function countWords(text) {
    return text.trim().split(/\s+/).length;
  }

  /**
   * Main standardization function
   */
  function standardize(data) {
    const {
      companyName = '',
      informalName = '',
      website = '',
      description = '',
      specialties = '',
      industries = '',
      endMarkets = ''
    } = data;
    
    // If no useful data, return minimal description
    if (!description && !specialties && !industries) {
      const name = extractCompanyName(companyName, informalName, website, '');
      const industry = detectIndustry('', '', industries);
      return `${name} operates in the ${industry === 'general' ? 'business services' : industry} sector.`;
    }
    
    // Clean inputs
    const cleanDesc = cleanText(description);
    const cleanSpecialties = cleanText(specialties);
    
    // Extract components
    const name = extractCompanyName(companyName, informalName, website, cleanDesc);
    const industry = detectIndustry(cleanDesc, cleanSpecialties, industries);
    const verb = selectVerb(cleanDesc, cleanSpecialties, industry);
    const offerings = extractKeyOfferings(cleanSpecialties, cleanDesc);
    const markets = extractTargetMarket(cleanDesc, endMarkets);
    
    // Build standardized description
    let result = `${name} ${verb}`;
    
    // Add offerings
    if (offerings.length > 0) {
      if (offerings.length === 1) {
        result += ` ${offerings[0]}`;
      } else if (offerings.length === 2) {
        result += ` ${offerings[0]} and ${offerings[1]}`;
      } else {
        const last = offerings.pop();
        result += ` ${offerings.join(', ')}, and ${last}`;
      }
    } else {
      // Fallback to generic industry description
      const industryDescriptors = {
        insurance: 'insurance and risk management solutions',
        healthcare: 'healthcare services and solutions',
        technology: 'technology solutions and services',
        manufacturing: 'manufacturing and production services',
        construction: 'construction and engineering services',
        finance: 'financial services and solutions',
        logistics: 'logistics and supply chain services',
        retail: 'retail and consumer products',
        energy: 'energy and utility services',
        realestate: 'real estate services and solutions',
        general: 'business services and solutions'
      };
      result += ` ${industryDescriptors[industry]}`;
    }
    
    // Add target market if space allows
    if (markets.length > 0 && countWords(result) < CONFIG.MAX_WORD_COUNT - 3) {
      result += ` for ${markets.join(' and ')}`;
    }
    
    // Ensure we end with a period
    if (!result.endsWith('.')) {
      result += '.';
    }
    
    // Final word count check
    if (countWords(result) > CONFIG.MAX_WORD_COUNT) {
      // Trim to word limit
      const words = result.split(/\s+/);
      result = words.slice(0, CONFIG.MAX_WORD_COUNT).join(' ');
      // Ensure proper ending
      if (!result.endsWith('.')) {
        result = result.replace(/[,;]?\s*$/, '.');
      }
    }
    
    return result;
  }

  // Public API
  return {
    standardize,
    cleanText,
    extractCompanyName,
    detectIndustry,
    CONFIG
  };
})();

// Export for use in targets.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DescriptionStandardizer;
}