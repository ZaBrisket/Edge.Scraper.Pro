/**
 * PFR URL Validation Module
 * Provides comprehensive validation for Pro Football Reference player URLs
 * with enhanced error categorization and reporting
 */

/**
 * PFR URL validation patterns and rules
 */
const PFR_VALIDATION_PATTERNS = {
  // Valid PFR player URL pattern
  playerUrl: /^https?:\/\/(www\.)?pro-football-reference\.com\/players\/[A-Z]\/[A-Za-z]{2,4}[A-Za-z0-9]{2,}\.htm$/,
  
  // Player slug pattern (extracted from URL)
  playerSlug: /^[A-Za-z]{2,4}[A-Za-z0-9]{2,}$/,
  
  // Position codes for validation
  positionCodes: /^(QB|RB|WR|TE|K|P|LS|OL|DL|LB|DB|S|CB|FS|SS)$/,
  
  // Common invalid patterns
  invalidPatterns: [
    /\/teams\//,           // Team pages
    /\/coaches\//,         // Coach pages
    /\/refs\//,            // Referee pages
    /\/leaders\//,         // League leaders
    /\/play-index\//,      // Play index
    /\/years\//,           // Year pages
    /\/draft\//,           // Draft pages
    /\/awards\//,          // Awards pages
    /\/hof\//,             // Hall of Fame
    /\/friv\//,            // Frivolities
    /\/misc\//,            // Miscellaneous
    /\/index\.htm$/,       // Index pages
    /\/$/,                 // Root pages
    /\.(jpg|png|gif|css|js|pdf)$/i  // Non-HTML files
  ]
};

/**
 * URL validation error types
 */
const VALIDATION_ERROR_TYPES = {
  MALFORMED_URL: 'malformed_url',
  NON_PLAYER_PAGE: 'non_player_page',
  INVALID_SLUG: 'invalid_slug',
  DUPLICATE: 'duplicate',
  INVALID_DOMAIN: 'invalid_domain',
  MISSING_PROTOCOL: 'missing_protocol',
  INVALID_EXTENSION: 'invalid_extension'
};

/**
 * PFR URL Validator Class
 */
class PFRUrlValidator {
  constructor() {
    this.seenUrls = new Set();
    this.seenSlugs = new Set();
    this.validationCache = new Map();
    this.cacheMaxSize = 1000;
  }

  /**
   * Validate a single PFR URL
   * @param {string} url - URL to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateUrl(url, options = {}) {
    const {
      checkDuplicates = true,
      useCache = true,
      strictMode = false
    } = options;

    // Check cache first
    if (useCache && this.validationCache.has(url)) {
      return this.validationCache.get(url);
    }

    const result = {
      url,
      isValid: false,
      errorType: null,
      errorMessage: '',
      playerSlug: null,
      normalizedUrl: null,
      warnings: []
    };

    try {
      // Basic URL structure validation
      if (!url || typeof url !== 'string') {
        result.errorType = VALIDATION_ERROR_TYPES.MALFORMED_URL;
        result.errorMessage = 'URL is not a valid string';
        return this.cacheResult(url, result);
      }

      // Normalize URL
      result.normalizedUrl = this.normalizeUrl(url);
      if (!result.normalizedUrl) {
        result.errorType = VALIDATION_ERROR_TYPES.MALFORMED_URL;
        result.errorMessage = 'Invalid URL format';
        return this.cacheResult(url, result);
      }

      // Check if it's a PFR domain
      if (!this.isPFRDomain(result.normalizedUrl)) {
        result.errorType = VALIDATION_ERROR_TYPES.INVALID_DOMAIN;
        result.errorMessage = 'Not a Pro Football Reference URL';
        return this.cacheResult(url, result);
      }

      // Check for invalid patterns first (before URL pattern validation)
      const invalidPattern = this.findInvalidPattern(result.normalizedUrl);
      if (invalidPattern) {
        result.errorType = VALIDATION_ERROR_TYPES.NON_PLAYER_PAGE;
        result.errorMessage = `URL appears to be a ${invalidPattern.type} page, not a player page`;
        return this.cacheResult(url, result);
      }

      // Validate player URL pattern
      if (!PFR_VALIDATION_PATTERNS.playerUrl.test(result.normalizedUrl)) {
        // Check if it's a malformed URL or invalid slug
        const slug = this.extractPlayerSlug(result.normalizedUrl);
        if (!slug) {
          result.errorType = VALIDATION_ERROR_TYPES.INVALID_SLUG;
          result.errorMessage = 'Could not extract valid player slug from URL';
        } else {
          result.errorType = VALIDATION_ERROR_TYPES.MALFORMED_URL;
          result.errorMessage = 'URL does not match expected PFR player page format';
        }
        return this.cacheResult(url, result);
      }

      // Extract and validate player slug
      const slug = this.extractPlayerSlug(result.normalizedUrl);
      if (!slug) {
        result.errorType = VALIDATION_ERROR_TYPES.INVALID_SLUG;
        result.errorMessage = 'Could not extract valid player slug from URL';
        return this.cacheResult(url, result);
      }

      if (!PFR_VALIDATION_PATTERNS.playerSlug.test(slug)) {
        result.errorType = VALIDATION_ERROR_TYPES.INVALID_SLUG;
        result.errorMessage = 'Player slug does not match expected format';
        return this.cacheResult(url, result);
      }

      result.playerSlug = slug;

      // Additional validation in strict mode
      if (strictMode) {
        const strictValidation = this.performStrictValidation(result.normalizedUrl, slug);
        if (!strictValidation.isValid) {
          result.warnings.push(strictValidation.warning);
        }
      }

      // Check for duplicates if requested (after validation but before marking as valid)
      if (checkDuplicates) {
        if (this.seenUrls.has(result.normalizedUrl)) {
          result.errorType = VALIDATION_ERROR_TYPES.DUPLICATE;
          result.errorMessage = 'Duplicate URL detected';
          return this.cacheResult(url, result);
        }

        if (this.seenSlugs.has(slug)) {
          result.warnings.push('Different URL with same player slug detected');
        }
      }

      // URL is valid
      result.isValid = true;
      result.errorMessage = '';

      // Track seen URLs and slugs (only if not a duplicate)
      if (checkDuplicates && result.isValid) {
        this.seenUrls.add(result.normalizedUrl);
        this.seenSlugs.add(slug);
      }

      return this.cacheResult(url, result);

    } catch (error) {
      result.errorType = VALIDATION_ERROR_TYPES.MALFORMED_URL;
      result.errorMessage = `Validation error: ${error.message}`;
      return this.cacheResult(url, result);
    }
  }

  /**
   * Validate multiple URLs in batch
   * @param {string[]} urls - Array of URLs to validate
   * @param {Object} options - Validation options
   * @returns {Object} Batch validation results
   */
  validateBatch(urls, options = {}) {
    const {
      preserveOrder = true,
      generateReport = true,
      ...validationOptions
    } = options;

    const startTime = Date.now();
    const results = [];
    const summary = {
      total: urls.length,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      errors: {},
      warnings: 0,
      processingTime: 0
    };

    // Process URLs
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const result = this.validateUrl(url, validationOptions);
      
      // Add original index for order preservation
      result.originalIndex = i;
      results.push(result);

      // Update summary
      if (result.isValid) {
        summary.valid++;
      } else {
        summary.invalid++;
        if (result.errorType === VALIDATION_ERROR_TYPES.DUPLICATE) {
          summary.duplicates++;
        }
        
        // Count error types
        summary.errors[result.errorType] = (summary.errors[result.errorType] || 0) + 1;
      }

      if (result.warnings && result.warnings.length > 0) {
        summary.warnings += result.warnings.length;
      }
    }

    summary.processingTime = Date.now() - startTime;

    // Generate detailed report if requested
    const report = generateReport ? this.generateValidationReport(results, summary) : null;

    return {
      results: preserveOrder ? results : results.sort((a, b) => a.originalIndex - b.originalIndex),
      summary,
      report
    };
  }

  /**
   * Generate detailed validation report
   * @param {Array} results - Validation results
   * @param {Object} summary - Summary statistics
   * @returns {Object} Detailed report
   */
  generateValidationReport(results, summary) {
    const report = {
      overview: {
        totalUrls: summary.total,
        validUrls: summary.valid,
        invalidUrls: summary.invalid,
        duplicateUrls: summary.duplicates,
        warningCount: summary.warnings,
        processingTimeMs: summary.processingTime,
        validationRate: summary.total > 0 ? (summary.valid / summary.total * 100).toFixed(2) + '%' : '0%'
      },
      errorBreakdown: summary.errors,
      invalidUrls: results
        .filter(r => !r.isValid)
        .map(r => ({
          url: r.url,
          errorType: r.errorType,
          errorMessage: r.errorMessage,
          originalIndex: r.originalIndex
        })),
      duplicateUrls: results
        .filter(r => r.errorType === VALIDATION_ERROR_TYPES.DUPLICATE)
        .map(r => ({
          url: r.url,
          originalIndex: r.originalIndex
        })),
      validUrls: results
        .filter(r => r.isValid)
        .map(r => ({
          url: r.url,
          playerSlug: r.playerSlug,
          originalIndex: r.originalIndex
        })),
      recommendations: this.generateRecommendations(summary, results)
    };

    return report;
  }

  /**
   * Generate recommendations based on validation results
   * @param {Object} summary - Summary statistics
   * @param {Array} results - Validation results
   * @returns {Array} Array of recommendations
   */
  generateRecommendations(summary, results) {
    const recommendations = [];

    if (summary.duplicates > 0) {
      recommendations.push({
        type: 'duplicates',
        priority: 'medium',
        message: `Found ${summary.duplicates} duplicate URLs. Consider removing duplicates to avoid redundant processing.`
      });
    }

    if (summary.invalid > summary.total * 0.1) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: `High invalid URL rate (${((summary.invalid / summary.total) * 100).toFixed(1)}%). Please review URL sources and formatting.`
      });
    }

    const commonErrors = Object.entries(summary.errors)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    if (commonErrors.length > 0) {
      recommendations.push({
        type: 'patterns',
        priority: 'low',
        message: `Most common error types: ${commonErrors.map(([type, count]) => `${type} (${count})`).join(', ')}`
      });
    }

    return recommendations;
  }

  /**
   * Normalize URL for consistent validation
   * @param {string} url - URL to normalize
   * @returns {string|null} Normalized URL or null if invalid
   */
  normalizeUrl(url) {
    try {
      // Handle null/undefined/empty strings
      if (!url || typeof url !== 'string' || url.trim() === '') {
        return null;
      }

      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const urlObj = new URL(url);
      
      // Normalize to https
      urlObj.protocol = 'https:';
      
      // Remove www. prefix for consistency
      if (urlObj.hostname.startsWith('www.')) {
        urlObj.hostname = urlObj.hostname.substring(4);
      }

      return urlObj.toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if URL is from PFR domain
   * @param {string} url - URL to check
   * @returns {boolean} True if PFR domain
   */
  isPFRDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'pro-football-reference.com' || 
             urlObj.hostname === 'www.pro-football-reference.com';
    } catch (error) {
      return false;
    }
  }

  /**
   * Find invalid patterns in URL
   * @param {string} url - URL to check
   * @returns {Object|null} Invalid pattern info or null
   */
  findInvalidPattern(url) {
    for (const pattern of PFR_VALIDATION_PATTERNS.invalidPatterns) {
      if (pattern.test(url)) {
        return {
          pattern: pattern.toString(),
          type: this.getPatternType(pattern)
        };
      }
    }
    return null;
  }

  /**
   * Get human-readable pattern type
   * @param {RegExp} pattern - Pattern to identify
   * @returns {string} Pattern type
   */
  getPatternType(pattern) {
    const patternStr = pattern.toString();
    if (patternStr.includes('teams')) return 'team';
    if (patternStr.includes('coaches')) return 'coach';
    if (patternStr.includes('refs')) return 'referee';
    if (patternStr.includes('leaders')) return 'league leader';
    if (patternStr.includes('play-index')) return 'play index';
    if (patternStr.includes('years')) return 'year';
    if (patternStr.includes('draft')) return 'draft';
    if (patternStr.includes('awards')) return 'award';
    if (patternStr.includes('hof')) return 'hall of fame';
    if (patternStr.includes('friv')) return 'frivolity';
    if (patternStr.includes('misc')) return 'miscellaneous';
    if (patternStr.includes('index')) return 'index';
    if (patternStr.includes('$')) return 'root';
    if (patternStr.includes('jpg|png|gif|css|js|pdf')) return 'non-HTML file';
    return 'unknown';
  }

  /**
   * Extract player slug from URL
   * @param {string} url - URL to extract slug from
   * @returns {string|null} Player slug or null
   */
  extractPlayerSlug(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      
      if (filename && filename.endsWith('.htm')) {
        return filename.substring(0, filename.length - 4);
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Perform strict validation (additional checks)
   * @param {string} url - URL to validate
   * @param {string} slug - Player slug
   * @returns {Object} Strict validation result
   */
  performStrictValidation(url, slug) {
    // Check for suspicious patterns
    if (slug.length < 3) {
      return { isValid: false, warning: 'Player slug is unusually short' };
    }

    if (slug.length > 10) {
      return { isValid: false, warning: 'Player slug is unusually long' };
    }

    // Check for common non-player patterns in slug
    const suspiciousPatterns = ['team', 'coach', 'ref', 'leader', 'draft', 'award', 'hof'];
    for (const pattern of suspiciousPatterns) {
      if (slug.toLowerCase().includes(pattern)) {
        return { isValid: false, warning: `Player slug contains suspicious pattern: ${pattern}` };
      }
    }

    return { isValid: true, warning: null };
  }

  /**
   * Cache validation result
   * @param {string} url - Original URL
   * @param {Object} result - Validation result
   * @returns {Object} Cached result
   */
  cacheResult(url, result) {
    // Implement simple LRU cache
    if (this.validationCache.size >= this.cacheMaxSize) {
      const firstKey = this.validationCache.keys().next().value;
      this.validationCache.delete(firstKey);
    }
    
    this.validationCache.set(url, result);
    return result;
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
    this.seenUrls.clear();
    this.seenSlugs.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.validationCache.size,
      seenUrls: this.seenUrls.size,
      seenSlugs: this.seenSlugs.size,
      maxCacheSize: this.cacheMaxSize
    };
  }
}

module.exports = {
  PFRUrlValidator,
  VALIDATION_ERROR_TYPES,
  PFR_VALIDATION_PATTERNS
};