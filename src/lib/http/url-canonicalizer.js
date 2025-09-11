/**
 * URL Canonicalizer for EdgeScraperPro
 * 
 * Handles URL normalization and fallback strategies:
 * - HTTP → HTTPS upgrade
 * - www/apex domain variants  
 * - Trailing slash normalization
 * - Preflight checks with HEAD/GET
 * - Redirect chain tracking
 */

const { URL } = require('url');
const createLogger = require('./logging');

class UrlCanonicalizer {
  constructor(options = {}) {
    this.logger = createLogger('url-canonicalizer');
    this.options = {
      maxVariants: options.maxVariants || 4,
      preflightTimeout: options.preflightTimeout || 5000,
      backoffDelays: options.backoffDelays || [500, 1000, 2000],
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      ...options
    };
    
    // Cache successful canonicalizations to avoid repeated work
    this.canonicalCache = new Map();
    this.cacheMaxAge = 30 * 60 * 1000; // 30 minutes
    this.lastCleanup = Date.now();
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate URL variants for fallback attempts
   * @param {string} originalUrl - Original URL that failed
   * @returns {Array<string>} Array of URL variants to try
   */
  generateUrlVariants(originalUrl) {
    const variants = [];
    
    try {
      const parsed = new URL(originalUrl);
      const { protocol, hostname, pathname, search, hash } = parsed;
      
      // Normalize path - ensure it doesn't end with slash unless it's root
      const normalizedPath = pathname === '/' ? pathname : pathname.replace(/\/$/, '');
      const pathWithSlash = normalizedPath === '/' ? '/' : normalizedPath + '/';
      
      // Generate variants in order of preference
      const baseVariants = [
        // 1. HTTPS upgrade (most common fix)
        protocol === 'http:' ? `https://${hostname}${normalizedPath}${search}${hash}` : null,
        
        // 2. HTTPS + www prefix (if not already www)
        protocol === 'http:' && !hostname.startsWith('www.') ? 
          `https://www.${hostname}${normalizedPath}${search}${hash}` : null,
          
        // 3. Original protocol + www prefix (if not already www and original was https)
        protocol === 'https:' && !hostname.startsWith('www.') ?
          `https://www.${hostname}${normalizedPath}${search}${hash}` : null,
        
        // 4. HTTPS + trailing slash
        protocol === 'http:' ? `https://${hostname}${pathWithSlash}${search}${hash}` : null,
        
        // 5. HTTPS + www + trailing slash
        protocol === 'http:' && !hostname.startsWith('www.') ?
          `https://www.${hostname}${pathWithSlash}${search}${hash}` : null,
          
        // 6. Remove www if present (apex domain)
        hostname.startsWith('www.') ?
          `${protocol}//${hostname.substring(4)}${normalizedPath}${search}${hash}` : null,
          
        // 7. HTTPS + remove www
        protocol === 'http:' && hostname.startsWith('www.') ?
          `https://${hostname.substring(4)}${normalizedPath}${search}${hash}` : null
      ];
      
      // Filter out null variants and duplicates
      const uniqueVariants = [...new Set(baseVariants.filter(Boolean))];
      
      // Don't include the original URL in variants
      return uniqueVariants.filter(variant => variant !== originalUrl);
      
    } catch (error) {
      this.logger.warn({ originalUrl, error: error.message }, 'Failed to parse URL for variants');
      return [];
    }
  }

  /**
   * Perform preflight check on a URL
   * @param {string} url - URL to check
   * @param {object} fetchClient - HTTP client to use
   * @returns {Promise<object>} Preflight result
   */
  async preflightCheck(url, fetchClient) {
    const startTime = Date.now();
    let redirectChain = [];
    
    try {
      // Try HEAD first (lighter weight)
      let response;
      let method = 'HEAD';
      
      try {
        response = await fetchClient(url, {
          method: 'HEAD',
          timeout: this.options.preflightTimeout,
          redirect: 'manual' // Handle redirects manually to track chain
        });
      } catch (headError) {
        // Some servers don't support HEAD, fall back to GET
        this.logger.debug({ url, headError: headError.message }, 'HEAD failed, trying GET');
        method = 'GET';
        response = await fetchClient(url, {
          method: 'GET',
          timeout: this.options.preflightTimeout,
          redirect: 'manual'
        });
      }

      // Handle redirects manually to build chain
      let finalResponse = response;
      let currentUrl = url;
      let redirectCount = 0;
      
      while (finalResponse.status >= 300 && finalResponse.status < 400 && 
             finalResponse.headers.get('location') && 
             redirectCount < this.options.maxRedirects) {
        
        const location = finalResponse.headers.get('location');
        const redirectUrl = new URL(location, currentUrl).toString();
        
        redirectChain.push({
          from: currentUrl,
          to: redirectUrl,
          status: finalResponse.status
        });
        
        currentUrl = redirectUrl;
        redirectCount++;
        
        // Follow the redirect
        finalResponse = await fetchClient(redirectUrl, {
          method: method,
          timeout: this.options.preflightTimeout,
          redirect: 'manual'
        });
      }

      const responseTime = Date.now() - startTime;
      
      return {
        success: finalResponse.status >= 200 && finalResponse.status < 400,
        status: finalResponse.status,
        finalUrl: currentUrl,
        redirectChain,
        responseTime,
        headers: {
          'cache-control': finalResponse.headers.get('cache-control'),
          'server': finalResponse.headers.get('server'),
          'content-type': finalResponse.headers.get('content-type')
        },
        method
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        responseTime,
        redirectChain
      };
    }
  }

  /**
   * Attempt to canonicalize a URL that returned 404
   * @param {string} originalUrl - Original URL that failed  
   * @param {object} fetchClient - HTTP client to use
   * @returns {Promise<object>} Canonicalization result
   */
  async canonicalizeUrl(originalUrl, fetchClient) {
    // Check cache first
    const cacheKey = originalUrl;
    const cached = this.canonicalCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheMaxAge) {
      this.logger.debug({ originalUrl, canonicalUrl: cached.result.canonicalUrl }, 'Using cached canonicalization');
      return cached.result;
    }

    // Clean up cache periodically
    if (Date.now() - this.lastCleanup > this.cleanupInterval) {
      this.cleanupCache();
    }

    const startTime = Date.now();
    const result = {
      originalUrl,
      canonicalUrl: null,
      success: false,
      attempts: [],
      totalResponseTime: 0,
      redirectChain: [],
      error: null
    };

    this.logger.info({ originalUrl }, 'Starting URL canonicalization');

    // Generate variants to try
    const variants = this.generateUrlVariants(originalUrl);
    
    if (variants.length === 0) {
      result.error = 'No viable URL variants to try';
      this.logger.warn({ originalUrl }, result.error);
      return result;
    }

    this.logger.debug({ originalUrl, variants }, `Trying ${variants.length} URL variants`);

    // Try each variant with backoff
    for (let i = 0; i < variants.length && i < this.options.maxVariants; i++) {
      const variant = variants[i];
      
      // Apply backoff delay (except for first attempt)
      if (i > 0 && this.options.backoffDelays[Math.min(i - 1, this.options.backoffDelays.length - 1)]) {
        const delay = this.options.backoffDelays[Math.min(i - 1, this.options.backoffDelays.length - 1)];
        this.logger.debug({ variant, delay }, 'Applying backoff delay');
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const attemptResult = await this.preflightCheck(variant, fetchClient);
      result.attempts.push({
        url: variant,
        ...attemptResult
      });
      
      result.totalResponseTime += attemptResult.responseTime || 0;

      if (attemptResult.success) {
        result.success = true;
        result.canonicalUrl = attemptResult.finalUrl || variant;
        result.redirectChain = attemptResult.redirectChain || [];
        
        this.logger.info({ 
          originalUrl, 
          canonicalUrl: result.canonicalUrl,
          attempts: i + 1,
          totalTime: Date.now() - startTime
        }, 'URL canonicalization successful');
        
        // Cache successful result
        this.canonicalCache.set(cacheKey, {
          result: { ...result },
          timestamp: Date.now()
        });
        
        return result;
      }

      this.logger.debug({ 
        variant, 
        status: attemptResult.status, 
        error: attemptResult.error 
      }, 'Variant attempt failed');
    }

    // All variants failed
    result.error = `All ${result.attempts.length} canonicalization attempts failed`;
    result.totalResponseTime = Date.now() - startTime;
    
    this.logger.warn({ 
      originalUrl, 
      attempts: result.attempts.length,
      totalTime: result.totalResponseTime 
    }, result.error);

    return result;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.canonicalCache.entries()) {
      if (now - value.timestamp > this.cacheMaxAge) {
        this.canonicalCache.delete(key);
        cleaned++;
      }
    }
    
    this.lastCleanup = now;
    
    if (cleaned > 0) {
      this.logger.debug({ cleaned, remaining: this.canonicalCache.size }, 'Cleaned up expired cache entries');
    }
  }

  /**
   * Get canonicalizer statistics
   * @returns {object} Stats object
   */
  getStats() {
    return {
      cacheSize: this.canonicalCache.size,
      cacheMaxAge: this.cacheMaxAge,
      lastCleanup: this.lastCleanup
    };
  }

  /**
   * Clear all cached canonicalizations
   */
  clearCache() {
    this.canonicalCache.clear();
    this.logger.debug('Cleared canonicalization cache');
  }
}

module.exports = { UrlCanonicalizer };