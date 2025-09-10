/**
 * PFR (Pro Football Reference) URL Validator Module
 * 
 * Validates and sanitizes Pro Football Reference player URLs
 * Provides categorized validation results for batch processing
 */

const { URL } = require('url');

// Valid PFR domains (including other sports reference sites)
const VALID_SPORTS_DOMAINS = [
  'pro-football-reference.com',
  'basketball-reference.com',
  'baseball-reference.com',
  'hockey-reference.com',
  'sports-reference.com'
];

// Player URL patterns by sport
const PLAYER_URL_PATTERNS = {
  'pro-football-reference.com': /^\/players\/[A-Z]\/[A-Za-z]{4}[A-Z][a-z]\d{2}\.htm$/,
  'basketball-reference.com': /^\/players\/[a-z]\/[a-z]+\d{2}\.html$/,
  'baseball-reference.com': /^\/players\/[a-z]\/[a-z]+\d{2}\.shtml$/,
  'hockey-reference.com': /^\/players\/[a-z]\/[a-z]+\d{2}\.html$/
};

// PFR player slug format: 4 letters from last name + 2 letters from first name + 2 digit disambiguator
// Example: /players/M/MahoPa00.htm (Patrick Mahomes)
const PFR_PLAYER_SLUG_REGEX = /^[A-Za-z]{4}[A-Z][a-z]\d{2}$/;

// Categories for invalid URLs
const VALIDATION_CATEGORIES = {
  VALID: 'valid',
  MALFORMED: 'malformed',
  NON_PLAYER: 'non_player',
  WRONG_DOMAIN: 'wrong_domain',
  INVALID_SLUG: 'invalid_slug',
  DUPLICATE: 'duplicate'
};

class PFRValidator {
  constructor() {
    this.validationCache = new Map();
  }

  /**
   * Validate a single URL
   * @param {string} urlString - The URL to validate
   * @returns {object} Validation result with category and details
   */
  validateURL(urlString) {
    // Check cache first
    if (this.validationCache.has(urlString)) {
      return this.validationCache.get(urlString);
    }

    const result = {
      url: urlString,
      isValid: false,
      category: VALIDATION_CATEGORIES.MALFORMED,
      error: null,
      normalized: null
    };

    try {
      // Attempt to parse URL
      const url = new URL(urlString);
      
      // Check protocol first
      if (!['http:', 'https:'].includes(url.protocol)) {
        result.category = VALIDATION_CATEGORIES.MALFORMED;
        result.error = `Invalid protocol: ${url.protocol}. Only http/https are supported`;
        this.validationCache.set(urlString, result);
        return result;
      }
      
      // Check if it's a sports reference domain
      const hostname = url.hostname.toLowerCase().replace('www.', '');
      if (!VALID_SPORTS_DOMAINS.includes(hostname)) {
        result.category = VALIDATION_CATEGORIES.WRONG_DOMAIN;
        result.error = `Invalid domain: ${hostname}. Expected one of: ${VALID_SPORTS_DOMAINS.join(', ')}`;
        this.validationCache.set(urlString, result);
        return result;
      }

      // Check if it's a player URL
      const pattern = PLAYER_URL_PATTERNS[hostname];
      if (!pattern) {
        result.category = VALIDATION_CATEGORIES.NON_PLAYER;
        result.error = `No player URL pattern defined for ${hostname}`;
        this.validationCache.set(urlString, result);
        return result;
      }

      if (!pattern.test(url.pathname)) {
        // Check if it's some other type of page
        if (url.pathname.includes('/teams/') || url.pathname.includes('/years/') || 
            url.pathname.includes('/coaches/') || url.pathname.includes('/officials/')) {
          result.category = VALIDATION_CATEGORIES.NON_PLAYER;
          result.error = 'URL is not a player page';
        } else {
          result.category = VALIDATION_CATEGORIES.INVALID_SLUG;
          result.error = 'Invalid player URL format';
        }
        this.validationCache.set(urlString, result);
        return result;
      }

      // Extract and validate player slug for PFR
      if (hostname === 'pro-football-reference.com') {
        const slugMatch = url.pathname.match(/\/players\/[A-Z]\/([A-Za-z]{4}[A-Z][a-z]\d{2})\.htm$/);
        if (slugMatch) {
          const slug = slugMatch[1];
          if (!PFR_PLAYER_SLUG_REGEX.test(slug)) {
            result.category = VALIDATION_CATEGORIES.INVALID_SLUG;
            result.error = `Invalid player slug format: ${slug}`;
            this.validationCache.set(urlString, result);
            return result;
          }
        }
      }

      // URL is valid - normalize it
      result.isValid = true;
      result.category = VALIDATION_CATEGORIES.VALID;
      result.normalized = this.normalizeURL(url);
      result.error = null;

    } catch (error) {
      result.category = VALIDATION_CATEGORIES.MALFORMED;
      result.error = `Failed to parse URL: ${error.message}`;
    }

    this.validationCache.set(urlString, result);
    return result;
  }

  /**
   * Normalize a URL by removing tracking parameters and hash
   * @param {URL} url - URL object to normalize
   * @returns {string} Normalized URL string
   */
  normalizeURL(url) {
    // Remove hash
    url.hash = '';
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'msclkid', 'dclid', 'ref', 'source'
    ];
    
    trackingParams.forEach(param => url.searchParams.delete(param));
    
    return url.href;
  }

  /**
   * Validate a batch of URLs with duplicate detection
   * @param {string[]} urls - Array of URLs to validate
   * @returns {object} Batch validation result with categorized URLs
   */
  validateBatch(urls) {
    const results = {
      total: urls.length,
      valid: [],
      invalid: {
        malformed: [],
        non_player: [],
        wrong_domain: [],
        invalid_slug: []
      },
      duplicates: [],
      summary: {
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0
      }
    };

    const seen = new Map(); // Track first occurrence of each normalized URL
    const originalOrder = new Map(); // Preserve original order

    urls.forEach((url, index) => {
      originalOrder.set(url, index);
      const validation = this.validateURL(url);
      
      if (validation.isValid) {
        const normalized = validation.normalized;
        
        // Check for duplicates
        if (seen.has(normalized)) {
          results.duplicates.push({
            url: url,
            normalized: normalized,
            firstOccurrence: seen.get(normalized),
            index: index
          });
          results.summary.duplicateCount++;
        } else {
          seen.set(normalized, url);
          results.valid.push({
            ...validation,
            index: index
          });
          results.summary.validCount++;
        }
      } else {
        // Categorize invalid URLs
        const category = validation.category;
        if (results.invalid[category]) {
          results.invalid[category].push({
            ...validation,
            index: index
          });
        }
        results.summary.invalidCount++;
      }
    });

    // Sort results by original order
    results.valid.sort((a, b) => a.index - b.index);
    Object.keys(results.invalid).forEach(category => {
      results.invalid[category].sort((a, b) => a.index - b.index);
    });
    results.duplicates.sort((a, b) => a.index - b.index);

    return results;
  }

  /**
   * Generate a human-readable validation report
   * @param {object} batchResult - Result from validateBatch
   * @returns {string} Formatted report string
   */
  generateReport(batchResult) {
    const lines = [];
    
    lines.push('=== PFR URL Validation Report ===');
    lines.push(`Total URLs: ${batchResult.total}`);
    lines.push(`Valid URLs: ${batchResult.summary.validCount}`);
    lines.push(`Invalid URLs: ${batchResult.summary.invalidCount}`);
    lines.push(`Duplicate URLs: ${batchResult.summary.duplicateCount}`);
    lines.push('');

    // Report duplicates
    if (batchResult.duplicates.length > 0) {
      lines.push('DUPLICATES FOUND:');
      const duplicateGroups = new Map();
      
      batchResult.duplicates.forEach(dup => {
        if (!duplicateGroups.has(dup.normalized)) {
          duplicateGroups.set(dup.normalized, []);
        }
        duplicateGroups.get(dup.normalized).push(dup.url);
      });

      duplicateGroups.forEach((urls, normalized) => {
        lines.push(`  ${normalized}`);
        urls.forEach(url => lines.push(`    - ${url}`));
      });
      lines.push('');
    }

    // Report invalid URLs by category
    const invalidCategories = Object.entries(batchResult.invalid)
      .filter(([_, urls]) => urls.length > 0);

    if (invalidCategories.length > 0) {
      lines.push('INVALID URLS:');
      
      invalidCategories.forEach(([category, urls]) => {
        const categoryName = category.replace(/_/g, ' ').toUpperCase();
        lines.push(`  ${categoryName} (${urls.length}):`);
        
        urls.forEach(({ url, error }) => {
          lines.push(`    - ${url}`);
          if (error) lines.push(`      Error: ${error}`);
        });
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML validation report for UI display
   * @param {object} batchResult - Result from validateBatch
   * @returns {string} HTML formatted report
   */
  generateHTMLReport(batchResult) {
    const html = [];
    
    html.push('<div class="validation-report">');
    html.push('<h3>URL Validation Report</h3>');
    html.push('<div class="validation-summary">');
    html.push(`<div>Total URLs: <strong>${batchResult.total}</strong></div>`);
    html.push(`<div>Valid URLs: <strong style="color: green">${batchResult.summary.validCount}</strong></div>`);
    html.push(`<div>Invalid URLs: <strong style="color: red">${batchResult.summary.invalidCount}</strong></div>`);
    html.push(`<div>Duplicate URLs: <strong style="color: orange">${batchResult.summary.duplicateCount}</strong></div>`);
    html.push('</div>');

    // Report duplicates
    if (batchResult.duplicates.length > 0) {
      html.push('<div class="validation-section">');
      html.push('<h4>Duplicates Found:</h4>');
      
      const duplicateGroups = new Map();
      batchResult.duplicates.forEach(dup => {
        if (!duplicateGroups.has(dup.normalized)) {
          duplicateGroups.set(dup.normalized, []);
        }
        duplicateGroups.get(dup.normalized).push(dup);
      });

      html.push('<div class="validation-category">');
      duplicateGroups.forEach((dups, normalized) => {
        html.push('<h5>' + this.escapeHtml(normalized) + '</h5>');
        html.push('<ul>');
        dups.forEach(dup => {
          html.push('<li>' + this.escapeHtml(dup.url) + ' (position ' + (dup.index + 1) + ')</li>');
        });
        // Also show the first occurrence
        const firstOccurrence = batchResult.valid.find(v => v.normalized === normalized);
        if (firstOccurrence) {
          html.push('<li><em>First occurrence: ' + this.escapeHtml(firstOccurrence.url) + ' (position ' + (firstOccurrence.index + 1) + ')</em></li>');
        }
        html.push('</ul>');
      });
      html.push('</div>');
      html.push('</div>');
    }

    // Report invalid URLs by category
    const invalidCategories = Object.entries(batchResult.invalid)
      .filter(([_, urls]) => urls.length > 0);

    if (invalidCategories.length > 0) {
      html.push('<div class="validation-section">');
      html.push('<h4>Invalid URLs:</h4>');
      
      invalidCategories.forEach(([category, urls]) => {
        const categoryName = category.replace(/_/g, ' ').toUpperCase();
        html.push('<div class="validation-category">');
        html.push(`<h5>${categoryName} (${urls.length})</h5>`);
        html.push('<ul>');
        
        urls.forEach(({ url, error, index }) => {
          html.push('<li class="invalid-url">');
          html.push(this.escapeHtml(url) + ' (position ' + (index + 1) + ')');
          if (error) {
            html.push('<br><small>Error: ' + this.escapeHtml(error) + '</small>');
          }
          html.push('</li>');
        });
        
        html.push('</ul>');
        html.push('</div>');
      });
      
      html.push('</div>');
    }

    html.push('</div>');
    
    return html.join('\n');
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    // Fallback for non-browser environments
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Clear the validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }
}

// Singleton instance
const validator = new PFRValidator();

module.exports = {
  PFRValidator,
  validator,
  VALIDATION_CATEGORIES
};