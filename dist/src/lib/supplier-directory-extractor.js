/**
 * Supplier Directory Content Extractor
 * Specialized for extracting company data from supplier directory pages
 * Handles structured data like company names, contact information, and websites
 */

const { JSDOM } = require('jsdom');

// Supplier directory specific content selectors
const SUPPLIER_SELECTORS = {
  // Main content containers
  mainContent: [
    '.main-content',
    '.content',
    '.directory-content',
    '.supplier-directory',
    '[class*="directory"]',
    '[class*="supplier"]',
    '[class*="company"]',
    'main',
    'article',
    '[role="main"]',
    '[role="article"]',
  ],

  // Company listing tables
  companyTables: [
    'table',
    '.table',
    '.data-table',
    '.company-table',
    '.supplier-table',
    '.directory-table',
    '[class*="table"]',
    '[class*="listing"]',
    '.view-all-companies',
    '.company-list',
    '.supplier-list',
  ],

  // Individual company rows
  companyRows: [
    'tr',
    '.company-row',
    '.supplier-row',
    '.listing-row',
    '[class*="company"]',
    '[class*="supplier"]',
    '[class*="listing"]',
  ],

  // Company name selectors
  companyName: [
    'td:first-child',
    '.company-name',
    '.supplier-name',
    '.name',
    '[class*="name"]',
    'strong',
    'b',
    'a',
  ],

  // Contact information selectors
  contactInfo: [
    'td:nth-child(2)',
    '.contact',
    '.address',
    '.contact-info',
    '[class*="contact"]',
    '[class*="address"]',
    '[class*="info"]',
  ],

  // Website selectors
  website: [
    'td:last-child',
    '.website',
    '.url',
    '.web',
    '.site',
    '[class*="website"]',
    '[class*="url"]',
    '[class*="web"]',
    'a[href*="http"]',
    'a[href*="www"]',
  ],
};

// Site-specific configurations for supplier directories
const SUPPLIER_SITE_CONFIGS = {
  'd2pbuyersguide.com': {
    name: 'Design 2 Part Supplier Directory',
    primaryContentSelector: '.view-all-companies, .main-content',
    companyTableSelector: 'table',
    companyRowSelector: 'tr',
    nameColumn: 0,
    contactColumn: 1,
    websiteColumn: 2,
    excludeSelectors: ['.advertisement', '.ad', '.sidebar', '.featured'],
    dataPatterns: {
      companyName: /^[A-Z][A-Z\s&.,-]+$/,
      address: /^\d+.*(?:St|Ave|Rd|Blvd|Dr|Way|Ln|Ct|Pl|Pkwy)\.?\s+.*,\s*[A-Z]{2}\s+\d{5}/,
      website: /^(www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/,
    },
  },
  'thomasnet.com': {
    name: 'ThomasNet Supplier Directory',
    primaryContentSelector: '.search-results, .supplier-results',
    companyTableSelector: '.supplier-card, .company-card',
    companyRowSelector: '.supplier-card, .company-card',
    nameColumn: 'name',
    contactColumn: 'address',
    websiteColumn: 'website',
    excludeSelectors: ['.advertisement', '.ad', '.promoted'],
  },
  'globalspec.com': {
    name: 'GlobalSpec Supplier Directory',
    primaryContentSelector: '.search-results, .supplier-listing',
    companyTableSelector: '.supplier-item, .company-item',
    companyRowSelector: '.supplier-item, .company-item',
    nameColumn: 'name',
    contactColumn: 'location',
    websiteColumn: 'website',
    excludeSelectors: ['.advertisement', '.ad', '.sponsored'],
  },
};

// Keywords for supplier directory content validation
const SUPPLIER_KEYWORDS = {
  general: [
    'supplier',
    'manufacturer',
    'company',
    'directory',
    'listing',
    'contact',
    'address',
    'website',
    'phone',
    'email',
    'location',
  ],
  industry: [
    'manufacturing',
    'contract',
    'fabrication',
    'machining',
    'assembly',
    'injection',
    'molding',
    'stamping',
    'coating',
    'finishing',
    'welding',
  ],
  business: [
    'inc',
    'llc',
    'corp',
    'ltd',
    'company',
    'manufacturing',
    'industries',
    'solutions',
    'services',
    'technologies',
    'systems',
    'products',
  ],
};

/**
 * Enhanced content extraction specifically designed for supplier directory pages
 */
class SupplierDirectoryExtractor {
  constructor() {
    this.debug = true;
  }

  /**
   * Main extraction method for supplier directory content
   */
  extractSupplierData(doc, url = '') {
    const siteConfig = this.getSiteConfig(url);
    const extractionResult = this.performSupplierExtraction(doc, siteConfig);

    return {
      companies: extractionResult.companies,
      metadata: extractionResult.metadata,
      method: extractionResult.method,
      score: extractionResult.score,
      debug: extractionResult.debug,
      validation: this.validateSupplierContent(extractionResult.companies),
    };
  }

  /**
   * Get site-specific configuration based on URL
   */
  getSiteConfig(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      for (const [domain, config] of Object.entries(SUPPLIER_SITE_CONFIGS)) {
        if (hostname.includes(domain)) {
          return { ...config, domain };
        }
      }
    } catch (e) {
      // Invalid URL, use default config
    }

    return SUPPLIER_SITE_CONFIGS['d2pbuyersguide.com']; // Default to D2P
  }

  /**
   * Perform supplier directory extraction
   */
  performSupplierExtraction(doc, siteConfig) {
    const docClone = doc.cloneNode(true);

    try {
      // Phase 1: Clean document while preserving supplier content
      this.cleanDocumentForSuppliers(docClone, siteConfig);

      // Phase 2: Extract company data
      const companies = this.extractCompanyData(docClone, siteConfig);

      // Phase 3: Extract metadata
      const metadata = this.extractMetadata(docClone, siteConfig);

      // Phase 4: Score and validate extraction
      const score = this.scoreExtraction(companies, metadata);

      return {
        companies,
        metadata,
        method: 'supplier-directory',
        score,
        debug: {
          companiesFound: companies.length,
          siteConfig: siteConfig.domain,
          extractionMethod: 'table-based',
        },
      };
    } finally {
      // Clean up DOM clone to prevent memory leaks
      this.cleanupDOMClone(docClone);
    }
  }

  /**
   * Clean document while preserving supplier-specific content
   */
  cleanDocumentForSuppliers(docClone, siteConfig) {
    // Remove non-content elements but preserve supplier tables and data
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      // Navigation and UI elements
      'nav:not([class*="content"]):not([id*="content"])',
      'footer:not([class*="content"]):not([id*="content"])',
      'header:not([class*="content"]):not([id*="content"])',
      'aside:not([class*="content"]):not([class*="supplier"])',
      // Ads and social media
      '[class*="advertisement"]',
      '[class*="ads"]',
      '[id*="ads"]',
      '[class*="social"]:not([class*="content"])',
      '[class*="share"]:not([class*="content"])',
      // Site-specific excludes
      ...siteConfig.excludeSelectors,
    ];

    removeSelectors.forEach(selector => {
      try {
        docClone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        // Continue if selector fails
      }
    });
  }

  /**
   * Extract company data from tables or structured content
   */
  extractCompanyData(docClone, siteConfig) {
    const companies = [];

    // Find company tables
    const tables = this.findCompanyTables(docClone, siteConfig);

    tables.forEach(table => {
      try {
        const tableCompanies = this.parseCompanyTable(table, siteConfig);
        companies.push(...tableCompanies);
      } catch (error) {
        if (this.debug) {
          console.warn('Error parsing company table:', error.message);
        }
      }
    });

    // If no tables found, try alternative extraction methods
    if (companies.length === 0) {
      const alternativeCompanies = this.extractCompaniesAlternative(docClone, siteConfig);
      companies.push(...alternativeCompanies);
    }

    return this.deduplicateCompanies(companies);
  }

  /**
   * Find company tables using various selectors
   */
  findCompanyTables(docClone, siteConfig) {
    const tables = [];

    // Try site-specific selector first
    if (siteConfig.companyTableSelector) {
      try {
        const foundTables = docClone.querySelectorAll(siteConfig.companyTableSelector);
        tables.push(...Array.from(foundTables));
      } catch (e) {
        // Continue if selector fails
      }
    }

    // Try general table selectors
    SUPPLIER_SELECTORS.companyTables.forEach(selector => {
      try {
        const foundTables = docClone.querySelectorAll(selector);
        tables.push(...Array.from(foundTables));
      } catch (e) {
        // Continue if selector fails
      }
    });

    return tables;
  }

  /**
   * Parse a company table into structured data
   */
  parseCompanyTable(table, siteConfig) {
    const companies = [];
    const rows = table.querySelectorAll('tr');

    // Skip header row if it exists
    let startRow = 0;
    if (rows.length > 0) {
      const firstRow = rows[0];
      const firstRowText = firstRow.textContent.toLowerCase();
      if (
        firstRowText.includes('name') ||
        firstRowText.includes('company') ||
        firstRowText.includes('contact') ||
        firstRowText.includes('website')
      ) {
        startRow = 1;
      }
    }

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td, th');

      if (cells.length < 2) continue; // Need at least name and contact

      try {
        const company = this.extractCompanyFromRow(cells, siteConfig);
        if (company && company.name) {
          companies.push(company);
        }
      } catch (error) {
        if (this.debug) {
          console.warn(`Error parsing row ${i}:`, error.message);
        }
      }
    }

    return companies;
  }

  /**
   * Extract company data from a table row
   */
  extractCompanyFromRow(cells, siteConfig) {
    const company = {
      name: '',
      contact: '',
      website: '',
      rawData: {},
    };

    // Extract name (usually first column)
    const nameIndex =
      typeof siteConfig.nameColumn === 'number'
        ? siteConfig.nameColumn
        : this.findColumnIndex(cells, ['name', 'company', 'supplier']);

    if (nameIndex >= 0 && cells[nameIndex]) {
      company.name = this.cleanText(cells[nameIndex].textContent);
    }

    // Extract contact information (usually second column)
    const contactIndex =
      typeof siteConfig.contactColumn === 'number'
        ? siteConfig.contactColumn
        : this.findColumnIndex(cells, ['contact', 'address', 'location', 'info']);

    if (contactIndex >= 0 && cells[contactIndex]) {
      company.contact = this.cleanText(cells[contactIndex].textContent);
    }

    // Extract website (usually last column or third column)
    const websiteIndex =
      typeof siteConfig.websiteColumn === 'number'
        ? siteConfig.websiteColumn
        : this.findColumnIndex(cells, ['website', 'url', 'web', 'site']);

    if (websiteIndex >= 0 && cells[websiteIndex]) {
      const websiteText = this.cleanText(cells[websiteIndex].textContent);
      const websiteLink = cells[websiteIndex].querySelector('a[href]');

      if (websiteLink) {
        company.website = this.normalizeWebsite(websiteLink.href);
      } else if (websiteText) {
        company.website = this.normalizeWebsite(websiteText);
      }
    }

    // Store raw data for debugging
    company.rawData = {
      cellCount: cells.length,
      cellTexts: Array.from(cells).map(cell => this.cleanText(cell.textContent)),
    };

    return company;
  }

  /**
   * Find column index by looking for keywords in cell content
   */
  findColumnIndex(cells, keywords) {
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.toLowerCase();
      if (keywords.some(keyword => cellText.includes(keyword))) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Alternative extraction method for non-table layouts
   */
  extractCompaniesAlternative(docClone, siteConfig) {
    const companies = [];

    // Look for company cards or individual listings
    const companyElements = docClone.querySelectorAll(
      '.company-card, .supplier-card, .listing-item, [class*="company"], [class*="supplier"]'
    );

    companyElements.forEach(element => {
      try {
        const company = this.extractCompanyFromElement(element, siteConfig);
        if (company && company.name) {
          companies.push(company);
        }
      } catch (error) {
        if (this.debug) {
          console.warn('Error extracting company from element:', error.message);
        }
      }
    });

    return companies;
  }

  /**
   * Extract company data from a single element
   */
  extractCompanyFromElement(element, siteConfig) {
    const company = {
      name: '',
      contact: '',
      website: '',
      rawData: {},
    };

    // Extract name
    const nameSelectors = SUPPLIER_SELECTORS.companyName;
    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl && nameEl.textContent.trim()) {
        company.name = this.cleanText(nameEl.textContent);
        break;
      }
    }

    // Extract contact
    const contactSelectors = SUPPLIER_SELECTORS.contactInfo;
    for (const selector of contactSelectors) {
      const contactEl = element.querySelector(selector);
      if (contactEl && contactEl.textContent.trim()) {
        company.contact = this.cleanText(contactEl.textContent);
        break;
      }
    }

    // Extract website
    const websiteSelectors = SUPPLIER_SELECTORS.website;
    for (const selector of websiteSelectors) {
      const websiteEl = element.querySelector(selector);
      if (websiteEl) {
        if (websiteEl.tagName === 'A' && websiteEl.href) {
          company.website = this.normalizeWebsite(websiteEl.href);
        } else {
          // Look for anchor inside the element
          const anchor = websiteEl.querySelector('a[href]');
          if (anchor && anchor.href) {
            company.website = this.normalizeWebsite(anchor.href);
          } else if (websiteEl.textContent.trim()) {
            company.website = this.normalizeWebsite(websiteEl.textContent);
          }
        }
        break;
      }
    }

    return company;
  }

  /**
   * Extract metadata about the directory page
   */
  extractMetadata(docClone, siteConfig) {
    const metadata = {
      title: '',
      description: '',
      totalCompanies: 0,
      siteName: siteConfig.name || 'Unknown',
      extractedAt: new Date().toISOString(),
    };

    // Extract page title
    const titleEl = docClone.querySelector('title, h1, .page-title');
    if (titleEl) {
      metadata.title = this.cleanText(titleEl.textContent);
    }

    // Extract description
    const descEl = docClone.querySelector(
      'meta[name="description"], .description, .page-description'
    );
    if (descEl) {
      metadata.description = this.cleanText(
        descEl.textContent || descEl.getAttribute('content') || ''
      );
    }

    return metadata;
  }

  /**
   * Score the extraction quality
   */
  scoreExtraction(companies, metadata) {
    let score = 0;

    // Base score for having companies
    score += Math.min(companies.length * 10, 100);

    // Quality score based on data completeness
    const completeCompanies = companies.filter(c => c.name && c.contact && c.website);
    score += completeCompanies.length * 20;

    // Bonus for having metadata
    if (metadata.title) score += 10;
    if (metadata.description) score += 10;

    // Penalty for empty companies
    const emptyCompanies = companies.filter(c => !c.name);
    score -= emptyCompanies.length * 5;

    return Math.max(0, Math.min(score, 200));
  }

  /**
   * Clean and normalize text content
   */
  cleanText(text) {
    if (!text) return '';

    return text
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize website URL
   */
  normalizeWebsite(website) {
    if (!website) return '';

    let url = website.trim();

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Remove www. if present (optional normalization)
    // url = url.replace(/^https?:\/\/www\./, 'https://');

    return url;
  }

  /**
   * Remove duplicate companies based on name similarity
   */
  deduplicateCompanies(companies) {
    const unique = [];
    const seen = new Set();

    companies.forEach(company => {
      if (!company.name) return;

      const normalizedName = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        unique.push(company);
      }
    });

    return unique;
  }

  /**
   * Validate extracted supplier content
   */
  validateSupplierContent(companies) {
    if (!companies || companies.length === 0) {
      return { isValid: false, score: 0, reasons: ['No companies found'] };
    }

    const validationRules = {
      hasCompanies: companies => companies.length > 0,
      hasNames: companies => companies.some(c => c.name && c.name.length > 2),
      hasContactInfo: companies => companies.some(c => c.contact && c.contact.length > 5),
      hasWebsites: companies => companies.some(c => c.website && c.website.length > 5),
      validNames: companies => companies.filter(c => c.name && /^[A-Z]/.test(c.name)).length > 0,
      validWebsites: companies =>
        companies.filter(c => c.website && /https?:\/\//.test(c.website)).length > 0,
    };

    const results = {};
    let score = 0;

    Object.entries(validationRules).forEach(([rule, test]) => {
      const passed = test(companies);
      results[rule] = passed;
      if (passed) score += 1;
    });

    const isValid = score >= 4; // Need at least 4 validation rules to pass
    const reasons = Object.entries(results)
      .filter(([_, passed]) => !passed)
      .map(([rule, _]) => rule);

    return { isValid, score, results, reasons };
  }

  /**
   * Clean up DOM clone to prevent memory leaks
   */
  cleanupDOMClone(docClone) {
    try {
      // Remove all child nodes to break circular references
      while (docClone.firstChild) {
        docClone.removeChild(docClone.firstChild);
      }

      // Clear any remaining references
      if (docClone.textContent !== undefined) {
        docClone.textContent = '';
      }

      // Force garbage collection hint (if available)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    } catch (error) {
      // Silently handle cleanup errors to avoid breaking extraction
      if (this.debug) {
        console.warn('DOM cleanup warning:', error.message);
      }
    }
  }
}

module.exports = {
  SupplierDirectoryExtractor,
  SUPPLIER_SELECTORS,
  SUPPLIER_SITE_CONFIGS,
};
