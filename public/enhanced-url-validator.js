/**
 * Enhanced URL Validator Module
 * 
 * Provides comprehensive URL validation including:
 * - Domain validation and connectivity checks
 * - URL formatting and normalization
 * - Scraping compatibility validation
 * - Batch processing with progress tracking
 */

// Enhanced validation categories
const ENHANCED_VALIDATION_CATEGORIES = {
  VALID: 'valid',
  MALFORMED: 'malformed',
  UNREACHABLE: 'unreachable',
  INVALID_DOMAIN: 'invalid_domain',
  SCRAPING_BLOCKED: 'scraping_blocked',
  REDIRECT_LOOP: 'redirect_loop',
  TIMEOUT: 'timeout',
  DUPLICATE: 'duplicate',
  INVALID_PROTOCOL: 'invalid_protocol',
  INVALID_PATH: 'invalid_path'
};

// Common scraping-friendly domains (can be expanded)
const SCRAPING_FRIENDLY_DOMAINS = [
  'pro-football-reference.com',
  'basketball-reference.com',
  'baseball-reference.com',
  'hockey-reference.com',
  'sports-reference.com',
  'wikipedia.org',
  'github.com',
  'stackoverflow.com',
  'reddit.com',
  'medium.com',
  'dev.to',
  'hashnode.com',
  'blogspot.com',
  'wordpress.com',
  'tumblr.com',
  'linkedin.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'youtube.com'
];

// Domains known to block scraping
const SCRAPING_BLOCKED_DOMAINS = [
  'amazon.com',
  'google.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com'
];

class EnhancedURLValidator {
  constructor() {
    this.validationCache = new Map();
    this.connectivityCache = new Map();
    this.maxConcurrentChecks = 5;
    this.timeoutMs = 5000;
  }

  /**
   * Validate a single URL with enhanced checks
   * @param {string} urlString - The URL to validate
   * @param {boolean} checkConnectivity - Whether to check if URL is reachable
   * @returns {Promise<object>} Enhanced validation result
   */
  async validateURL(urlString, checkConnectivity = false) {
    const cacheKey = `${urlString}_${checkConnectivity}`;
    
    // Check cache first
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    const result = {
      url: urlString,
      originalUrl: urlString,
      isValid: false,
      category: ENHANCED_VALIDATION_CATEGORIES.MALFORMED,
      error: null,
      normalized: null,
      formatted: null,
      domain: null,
      isReachable: false,
      responseTime: null,
      redirects: [],
      warnings: []
    };

    try {
      // Step 1: Basic URL parsing and formatting
      const formattedResult = this.formatAndNormalizeURL(urlString);
      if (!formattedResult.isValid) {
        result.category = formattedResult.category;
        result.error = formattedResult.error;
        this.validationCache.set(cacheKey, result);
        return result;
      }

      result.formatted = formattedResult.formatted;
      result.normalized = formattedResult.normalized;
      result.domain = formattedResult.domain;

      // Step 2: Domain validation
      const domainResult = this.validateDomain(formattedResult.domain);
      if (!domainResult.isValid) {
        result.category = domainResult.category;
        result.error = domainResult.error;
        this.validationCache.set(cacheKey, result);
        return result;
      }

      // Step 3: Connectivity check (if requested)
      if (checkConnectivity) {
        const connectivityResult = await this.checkConnectivity(formattedResult.formatted);
        result.isReachable = connectivityResult.isReachable;
        result.responseTime = connectivityResult.responseTime;
        result.redirects = connectivityResult.redirects;
        
        // Only fail validation for truly unreachable URLs, not CORS or network issues
        if (!connectivityResult.isReachable && 
            connectivityResult.category !== ENHANCED_VALIDATION_CATEGORIES.TIMEOUT &&
            !connectivityResult.error?.includes('CORS') &&
            !connectivityResult.error?.includes('cross-origin') &&
            !connectivityResult.error?.includes('blocked by CORS policy')) {
          result.category = connectivityResult.category;
          result.error = connectivityResult.error;
          this.validationCache.set(cacheKey, result);
          return result;
        }
        
        // Add connectivity warnings for CORS or timeout issues
        if (connectivityResult.error?.includes('CORS') || 
            connectivityResult.error?.includes('cross-origin') ||
            connectivityResult.error?.includes('blocked by CORS policy')) {
          result.warnings = result.warnings || [];
          result.warnings.push('CORS restricted - may require server-side scraping');
        }
        if (connectivityResult.category === ENHANCED_VALIDATION_CATEGORIES.TIMEOUT) {
          result.warnings = result.warnings || [];
          result.warnings.push('URL timed out during connectivity check - may still be valid');
        }
      }

      // Step 4: Scraping compatibility check
      const scrapingResult = this.checkScrapingCompatibility(formattedResult.domain, formattedResult.formatted);
      if (!scrapingResult.isCompatible) {
        result.category = scrapingResult.category;
        result.error = scrapingResult.error;
        result.warnings = scrapingResult.warnings;
        this.validationCache.set(cacheKey, result);
        return result;
      }

      // All checks passed
      result.isValid = true;
      result.category = ENHANCED_VALIDATION_CATEGORIES.VALID;
      result.warnings = scrapingResult.warnings || [];

    } catch (error) {
      result.category = ENHANCED_VALIDATION_CATEGORIES.MALFORMED;
      result.error = `Validation error: ${error.message}`;
    }

    this.validationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Format and normalize URL for consistent processing
   * @param {string} urlString - Raw URL string
   * @returns {object} Formatting result
   */
  formatAndNormalizeURL(urlString) {
    try {
      // Clean and normalize the URL
      let cleanedUrl = urlString.trim();
      
      // Add protocol if missing
      if (!cleanedUrl.match(/^https?:\/\//)) {
        cleanedUrl = 'https://' + cleanedUrl;
      }

      const url = new URL(cleanedUrl);
      
      // Remove common tracking parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'gclid', 'fbclid', 'ref', 'source', 'campaign', 'affiliate',
        'click_id', 'clickid', 'partner_id', 'promo', 'discount'
      ];
      
      trackingParams.forEach(param => {
        url.searchParams.delete(param);
      });

      // Remove hash fragments
      url.hash = '';

      // Normalize path (remove trailing slashes, normalize case)
      let pathname = url.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }
      url.pathname = pathname;

      const formatted = url.href;
      const normalized = url.href.toLowerCase();
      const domain = url.hostname.toLowerCase().replace('www.', '');

      return {
        isValid: true,
        formatted,
        normalized,
        domain,
        original: urlString
      };

    } catch (error) {
      return {
        isValid: false,
        category: ENHANCED_VALIDATION_CATEGORIES.MALFORMED,
        error: `Invalid URL format: ${error.message}`,
        formatted: null,
        normalized: null,
        domain: null
      };
    }
  }

  /**
   * Validate domain for basic accessibility
   * @param {string} domain - Domain to validate
   * @returns {object} Domain validation result
   */
  validateDomain(domain) {
    // Check if domain is valid
    if (!domain || domain.length < 3) {
      return {
        isValid: false,
        category: ENHANCED_VALIDATION_CATEGORIES.INVALID_DOMAIN,
        error: 'Invalid domain format'
      };
    }

    // Check for valid domain pattern
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainPattern.test(domain)) {
      return {
        isValid: false,
        category: ENHANCED_VALIDATION_CATEGORIES.INVALID_DOMAIN,
        error: 'Invalid domain format'
      };
    }

    // Check for localhost or IP addresses (might be problematic for scraping)
    if (domain === 'localhost' || domain.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return {
        isValid: false,
        category: ENHANCED_VALIDATION_CATEGORIES.INVALID_DOMAIN,
        error: 'Localhost and IP addresses are not suitable for scraping'
      };
    }

    return {
      isValid: true,
      domain
    };
  }

  /**
   * Check if URL is reachable and measure response time
   * @param {string} url - URL to check
   * @returns {Promise<object>} Connectivity result
   */
  async checkConnectivity(url) {
    const cacheKey = `connectivity_${url}`;
    
    if (this.connectivityCache.has(cacheKey)) {
      return this.connectivityCache.get(cacheKey);
    }

    const result = {
      isReachable: false,
      responseTime: null,
      redirects: [],
      category: ENHANCED_VALIDATION_CATEGORIES.UNREACHABLE,
      error: null
    };

    try {
      const startTime = Date.now();
      
      // Use fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD to minimize data transfer
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; URLValidator/1.0)'
        }
      });

      clearTimeout(timeoutId);
      result.responseTime = Date.now() - startTime;
      result.isReachable = true;
      result.category = ENHANCED_VALIDATION_CATEGORIES.VALID;

      // Track redirects
      if (response.redirected) {
        result.redirects.push(response.url);
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        result.category = ENHANCED_VALIDATION_CATEGORIES.TIMEOUT;
        result.error = 'Request timed out';
      } else if (error.name === 'TypeError' && (
        error.message.includes('CORS') || 
        error.message.includes('cross-origin') ||
        error.message.includes('blocked by CORS policy') ||
        error.message.includes('Access to fetch at') ||
        error.message.includes('has been blocked by CORS policy')
      )) {
        // CORS error means the URL is reachable but blocked by CORS policy
        result.isReachable = true;
        result.category = ENHANCED_VALIDATION_CATEGORIES.VALID;
        result.warnings = ['CORS restricted - may require server-side scraping'];
      } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        // Network error - but don't fail validation, just mark as potentially unreachable
        result.isReachable = false;
        result.category = ENHANCED_VALIDATION_CATEGORIES.VALID; // Still consider valid for scraping
        result.warnings = ['Network error during connectivity check - URL may still be valid for scraping'];
      } else {
        // Other errors - still consider valid for scraping
        result.isReachable = false;
        result.category = ENHANCED_VALIDATION_CATEGORIES.VALID;
        result.warnings = [`Connectivity check failed: ${error.message} - URL may still be valid for scraping`];
      }
    }

    this.connectivityCache.set(cacheKey, result);
    return result;
  }

  /**
   * Check if domain is compatible with scraping
   * @param {string} domain - Domain to check
   * @param {string} url - Full URL
   * @returns {object} Scraping compatibility result
   */
  checkScrapingCompatibility(domain, url) {
    const warnings = [];
    let isCompatible = true;
    let category = ENHANCED_VALIDATION_CATEGORIES.VALID;
    let error = null;

    // Check if domain is known to block scraping
    if (SCRAPING_BLOCKED_DOMAINS.some(blockedDomain => domain.includes(blockedDomain))) {
      isCompatible = false;
      category = ENHANCED_VALIDATION_CATEGORIES.SCRAPING_BLOCKED;
      error = `Domain ${domain} is known to block scraping`;
    }

    // Check if domain is scraping-friendly
    if (SCRAPING_FRIENDLY_DOMAINS.some(friendlyDomain => domain.includes(friendlyDomain))) {
      warnings.push('Domain is known to be scraping-friendly');
    }

    // Check for suspicious patterns
    if (url.includes('login') || url.includes('signin') || url.includes('auth')) {
      warnings.push('URL appears to be a login page - may not be suitable for scraping');
    }

    if (url.includes('api/') || url.includes('/api/')) {
      warnings.push('URL appears to be an API endpoint - consider using direct API access');
    }

    return {
      isCompatible,
      category,
      error,
      warnings
    };
  }

  /**
   * Validate a batch of URLs with progress tracking
   * @param {string[]} urls - Array of URLs to validate
   * @param {boolean} checkConnectivity - Whether to check connectivity
   * @param {function} progressCallback - Progress callback function
   * @returns {Promise<object>} Batch validation result
   */
  async validateBatch(urls, checkConnectivity = false, progressCallback = null) {
    const results = {
      total: urls.length,
      valid: [],
      invalid: {},
      duplicates: [],
      summary: {
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        unreachableCount: 0,
        scrapingBlockedCount: 0
      },
      processingTime: 0,
      warnings: []
    };

    // Initialize invalid categories
    Object.values(ENHANCED_VALIDATION_CATEGORIES).forEach(category => {
      if (category !== 'valid' && category !== 'duplicate') {
        results.invalid[category] = [];
      }
    });

    const startTime = Date.now();
    const seen = new Set();
    const duplicateMap = new Map();

    // Process URLs in chunks to avoid overwhelming the system
    const chunkSize = this.maxConcurrentChecks;
    const chunks = [];
    for (let i = 0; i < urls.length; i += chunkSize) {
      chunks.push(urls.slice(i, i + chunkSize));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const promises = chunk.map(async (url, localIndex) => {
        const globalIndex = chunkIndex * chunkSize + localIndex;
        
        try {
          const validation = await this.validateURL(url, checkConnectivity);
          
          // Check for duplicates
          if (validation.normalized && seen.has(validation.normalized)) {
            const duplicateInfo = {
              url: validation.url,
              normalized: validation.normalized,
              index: globalIndex,
              originalIndex: duplicateMap.get(validation.normalized)
            };
            results.duplicates.push(duplicateInfo);
            results.summary.duplicateCount++;
            return;
          }

          if (validation.normalized) {
            seen.add(validation.normalized);
            duplicateMap.set(validation.normalized, globalIndex);
          }

          // Categorize result
          if (validation.isValid) {
            results.valid.push({
              ...validation,
              index: globalIndex
            });
            results.summary.validCount++;
          } else {
            const category = validation.category;
            if (results.invalid[category]) {
              results.invalid[category].push({
                ...validation,
                index: globalIndex
              });
            }
            results.summary.invalidCount++;

            // Update specific counters
            if (category === ENHANCED_VALIDATION_CATEGORIES.UNREACHABLE) {
              results.summary.unreachableCount++;
            } else if (category === ENHANCED_VALIDATION_CATEGORIES.SCRAPING_BLOCKED) {
              results.summary.scrapingBlockedCount++;
            }
          }

          // Collect warnings
          if (validation.warnings && validation.warnings.length > 0) {
            results.warnings.push(...validation.warnings);
          }

        } catch (error) {
          results.invalid[ENHANCED_VALIDATION_CATEGORIES.MALFORMED].push({
            url: url,
            index: globalIndex,
            isValid: false,
            category: ENHANCED_VALIDATION_CATEGORIES.MALFORMED,
            error: error.message
          });
          results.summary.invalidCount++;
        }

        // Report progress
        if (progressCallback) {
          const progress = Math.round(((globalIndex + 1) / urls.length) * 100);
          progressCallback(progress, globalIndex + 1, urls.length);
        }
      });

      await Promise.all(promises);
      
      // Small delay between chunks to avoid overwhelming the system
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    results.processingTime = Date.now() - startTime;

    // Sort results by original order
    results.valid.sort((a, b) => a.index - b.index);
    Object.keys(results.invalid).forEach(category => {
      results.invalid[category].sort((a, b) => a.index - b.index);
    });
    results.duplicates.sort((a, b) => a.index - b.index);

    return results;
  }

  /**
   * Generate comprehensive validation report
   * @param {object} batchResult - Result from validateBatch
   * @returns {string} Formatted report
   */
  generateReport(batchResult) {
    const lines = [];
    
    lines.push('=== Enhanced URL Validation Report ===');
    lines.push(`Total URLs: ${batchResult.total}`);
    lines.push(`Valid URLs: ${batchResult.summary.validCount}`);
    lines.push(`Invalid URLs: ${batchResult.summary.invalidCount}`);
    lines.push(`Duplicate URLs: ${batchResult.summary.duplicateCount}`);
    lines.push(`Unreachable URLs: ${batchResult.summary.unreachableCount}`);
    lines.push(`Scraping Blocked URLs: ${batchResult.summary.scrapingBlockedCount}`);
    lines.push(`Processing Time: ${(batchResult.processingTime / 1000).toFixed(2)}s`);
    lines.push('');

    // Report warnings
    if (batchResult.warnings.length > 0) {
      lines.push('WARNINGS:');
      const uniqueWarnings = [...new Set(batchResult.warnings)];
      uniqueWarnings.forEach(warning => {
        lines.push(`  - ${warning}`);
      });
      lines.push('');
    }

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
      lines.push('INVALID URLS BY CATEGORY:');
      
      invalidCategories.forEach(([category, urls]) => {
        const categoryName = category.replace(/_/g, ' ').toUpperCase();
        lines.push(`  ${categoryName} (${urls.length}):`);
        
        urls.forEach(({ url, error, warnings }) => {
          lines.push(`    - ${url}`);
          if (error) lines.push(`      Error: ${error}`);
          if (warnings && warnings.length > 0) {
            warnings.forEach(warning => lines.push(`      Warning: ${warning}`));
          }
        });
        lines.push('');
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
    
    html.push('<div class="enhanced-validation-report">');
    html.push('<h3>Enhanced URL Validation Report</h3>');
    
    // Summary section
    html.push('<div class="validation-summary">');
    html.push(`<div>Total URLs: <strong>${batchResult.total}</strong></div>`);
    html.push(`<div>Valid URLs: <strong style="color: green">${batchResult.summary.validCount}</strong></div>`);
    html.push(`<div>Invalid URLs: <strong style="color: red">${batchResult.summary.invalidCount}</strong></div>`);
    html.push(`<div>Duplicate URLs: <strong style="color: orange">${batchResult.summary.duplicateCount}</strong></div>`);
    html.push(`<div>Unreachable URLs: <strong style="color: #ff6b6b">${batchResult.summary.unreachableCount}</strong></div>`);
    html.push(`<div>Scraping Blocked URLs: <strong style="color: #ff4757">${batchResult.summary.scrapingBlockedCount}</strong></div>`);
    html.push(`<div>Processing Time: <strong>${(batchResult.processingTime / 1000).toFixed(2)}s</strong></div>`);
    html.push('</div>');

    // Warnings section
    if (batchResult.warnings.length > 0) {
      html.push('<div class="warnings-section">');
      html.push('<h4>Warnings</h4>');
      html.push('<ul>');
      const uniqueWarnings = [...new Set(batchResult.warnings)];
      uniqueWarnings.forEach(warning => {
        html.push(`<li>${warning}</li>`);
      });
      html.push('</ul>');
      html.push('</div>');
    }

    // Duplicates section
    if (batchResult.duplicates.length > 0) {
      html.push('<div class="duplicates-section">');
      html.push('<h4>Duplicate URLs</h4>');
      html.push('<ul>');
      const duplicateGroups = new Map();
      
      batchResult.duplicates.forEach(dup => {
        if (!duplicateGroups.has(dup.normalized)) {
          duplicateGroups.set(dup.normalized, []);
        }
        duplicateGroups.get(dup.normalized).push(dup.url);
      });

      duplicateGroups.forEach((urls, normalized) => {
        html.push(`<li><strong>${normalized}</strong>`);
        html.push('<ul>');
        urls.forEach(url => html.push(`<li>${url}</li>`));
        html.push('</ul></li>');
      });
      html.push('</ul>');
      html.push('</div>');
    }

    // Invalid URLs section
    const invalidCategories = Object.entries(batchResult.invalid)
      .filter(([_, urls]) => urls.length > 0);

    if (invalidCategories.length > 0) {
      html.push('<div class="invalid-urls-section">');
      html.push('<h4>Invalid URLs by Category</h4>');
      
      invalidCategories.forEach(([category, urls]) => {
        const categoryName = category.replace(/_/g, ' ').toUpperCase();
        html.push(`<div class="category-section">`);
        html.push(`<h5>${categoryName} (${urls.length})</h5>`);
        html.push('<ul>');
        
        urls.forEach(({ url, error, warnings }) => {
          html.push(`<li><strong>${url}</strong>`);
          if (error) html.push(`<br><span class="error">Error: ${error}</span>`);
          if (warnings && warnings.length > 0) {
            warnings.forEach(warning => {
              html.push(`<br><span class="warning">Warning: ${warning}</span>`);
            });
          }
          html.push('</li>');
        });
        
        html.push('</ul></div>');
      });
      
      html.push('</div>');
    }

    html.push('</div>');
    return html.join('');
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
    this.connectivityCache.clear();
  }

  /**
   * Get validation statistics
   * @returns {object} Validation statistics
   */
  getStats() {
    return {
      cacheSize: this.validationCache.size,
      connectivityCacheSize: this.connectivityCache.size,
      maxConcurrentChecks: this.maxConcurrentChecks,
      timeoutMs: this.timeoutMs
    };
  }
}

// Create global instance
window.EnhancedURLValidator = EnhancedURLValidator;
window.ENHANCED_VALIDATION_CATEGORIES = ENHANCED_VALIDATION_CATEGORIES;