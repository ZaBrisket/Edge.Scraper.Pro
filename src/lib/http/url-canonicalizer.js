const { URL } = require('url');
const { fetchWithPolicy } = require('./enhanced-client');
const { NetworkError, ValidationError } = require('./errors');
const createLogger = require('./logging');

/**
 * URL Canonicalizer - Resolves URL variants to find working canonical URLs
 * 
 * This module implements robust URL normalization to handle common issues:
 * - HTTP → HTTPS upgrades
 * - www vs non-www variants
 * - Trailing slash normalization
 * - Protocol and host canonicalization
 */
class URLCanonicalizer {
  constructor(options = {}) {
    this.options = {
      maxVariants: options.maxVariants || 8,
      timeout: options.timeout || 5000,
      backoffMs: options.backoffMs || [500, 1000, 2000],
      userAgent: options.userAgent || 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      ...options
    };
    this.logger = createLogger('url-canonicalizer');
  }

  /**
   * Generate URL variants for canonicalization
   * @param {string} originalUrl - The original URL to canonicalize
   * @returns {Array<string>} Array of URL variants to try
   */
  generateVariants(originalUrl) {
    try {
      const url = new URL(originalUrl);
      const variants = [];
      
      // Extract components
      const protocol = url.protocol;
      const host = url.host;
      const pathname = url.pathname;
      const search = url.search;
      const hash = url.hash;
      
      // Determine if we need to try both www and non-www variants
      const hasWww = host.startsWith('www.');
      const baseHost = hasWww ? host.substring(4) : host;
      const wwwHost = hasWww ? host : `www.${host}`;
      
      // Determine if we need to try both HTTP and HTTPS
      const needsHttps = protocol === 'http:';
      const needsHttp = protocol === 'https:';
      
      // Generate variants in order of preference
      const variantsToTry = [];
      
      // 1. Original URL (if already HTTPS)
      if (protocol === 'https:') {
        variantsToTry.push(originalUrl);
      }
      
      // 2. HTTPS version of original
      if (needsHttps) {
        variantsToTry.push(`https://${host}${pathname}${search}${hash}`);
      }
      
      // 3. HTTPS with www variant
      if (needsHttps || hasWww) {
        variantsToTry.push(`https://${wwwHost}${pathname}${search}${hash}`);
      }
      
      // 4. HTTPS with trailing slash
      if (needsHttps || !pathname.endsWith('/')) {
        variantsToTry.push(`https://${host}${pathname}${pathname.endsWith('/') ? '' : '/'}${search}${hash}`);
      }
      
      // 5. HTTPS with www and trailing slash
      if (needsHttps || hasWww || !pathname.endsWith('/')) {
        variantsToTry.push(`https://${wwwHost}${pathname}${pathname.endsWith('/') ? '' : '/'}${search}${hash}`);
      }
      
      // 6. HTTP version (fallback)
      if (needsHttp) {
        variantsToTry.push(`http://${host}${pathname}${search}${hash}`);
      }
      
      // 7. HTTP with www variant
      if (needsHttp || hasWww) {
        variantsToTry.push(`http://${wwwHost}${pathname}${search}${hash}`);
      }
      
      // 8. HTTP with trailing slash
      if (needsHttp || !pathname.endsWith('/')) {
        variantsToTry.push(`http://${host}${pathname}${pathname.endsWith('/') ? '' : '/'}${search}${hash}`);
      }
      
      // Remove duplicates and limit to maxVariants
      const uniqueVariants = [...new Set(variantsToTry)];
      return uniqueVariants.slice(0, this.options.maxVariants);
      
    } catch (error) {
      this.logger.error({ error: error.message, originalUrl }, 'Failed to generate URL variants');
      return [originalUrl]; // Fallback to original
    }
  }

  /**
   * Test a single URL variant with HEAD request first, then GET if needed
   * @param {string} url - URL to test
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Object>} Result object with status, finalUrl, redirectChain, etc.
   */
  async testVariant(url, correlationId) {
    const startTime = Date.now();
    let redirectChain = [];
    let finalUrl = url;
    
    try {
      // Try HEAD request first (faster)
      const headResponse = await fetchWithPolicy(url, {
        method: 'HEAD',
        timeout: this.options.timeout,
        correlationId,
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      // Track redirects
      if (headResponse.redirected) {
        redirectChain.push(url);
        finalUrl = headResponse.url;
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        status: headResponse.status,
        finalUrl,
        redirectChain,
        responseTime,
        method: 'HEAD',
        headers: {
          'content-type': headResponse.headers.get('content-type'),
          'content-length': headResponse.headers.get('content-length'),
          'server': headResponse.headers.get('server'),
          'cache-control': headResponse.headers.get('cache-control'),
          'last-modified': headResponse.headers.get('last-modified')
        }
      };
      
    } catch (headError) {
      // If HEAD fails, try GET request
      try {
        const getResponse = await fetchWithPolicy(url, {
          method: 'GET',
          timeout: this.options.timeout,
          correlationId,
          headers: {
            'User-Agent': this.options.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        // Track redirects
        if (getResponse.redirected) {
          redirectChain.push(url);
          finalUrl = getResponse.url;
        }
        
        const responseTime = Date.now() - startTime;
        
        return {
          success: true,
          status: getResponse.status,
          finalUrl,
          redirectChain,
          responseTime,
          method: 'GET',
          headers: {
            'content-type': getResponse.headers.get('content-type'),
            'content-length': getResponse.headers.get('content-length'),
            'server': getResponse.headers.get('server'),
            'cache-control': getResponse.headers.get('cache-control'),
            'last-modified': getResponse.headers.get('last-modified')
          }
        };
        
      } catch (getError) {
        const responseTime = Date.now() - startTime;
        
        return {
          success: false,
          error: getError.message,
          errorClass: this.classifyError(getError),
          status: getError.meta?.status || null,
          finalUrl: url,
          redirectChain,
          responseTime,
          method: 'GET'
        };
      }
    }
  }

  /**
   * Classify error type for structured logging
   * @param {Error} error - The error to classify
   * @returns {string} Error class
   */
  classifyError(error) {
    if (error.meta?.status) {
      const status = error.meta.status;
      if (status === 404) return 'http_404';
      if (status === 403) return 'http_403';
      if (status === 429) return 'http_429';
      if (status >= 500) return 'http_5xx';
      if (status >= 400) return 'http_4xx';
    }
    
    if (error.name === 'AbortError') return 'timeout';
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') return 'dns_error';
    if (error.code === 'ECONNREFUSED') return 'connection_refused';
    if (error.code === 'ETIMEDOUT') return 'timeout';
    if (error.message.includes('robots.txt')) return 'blocked_by_robots';
    if (error.message.includes('bot') || error.message.includes('captcha')) return 'anti_bot_challenge';
    
    return 'network_error';
  }

  /**
   * Canonicalize a URL by trying variants until one succeeds
   * @param {string} originalUrl - The original URL to canonicalize
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Object>} Canonicalization result
   */
  async canonicalize(originalUrl, correlationId) {
    const logger = this.logger.child({ correlationId, originalUrl });
    const startTime = Date.now();
    
    try {
      // Validate input URL
      new URL(originalUrl);
    } catch (error) {
      return {
        success: false,
        originalUrl,
        error: 'Invalid URL format',
        errorClass: 'invalid_url',
        attempts: 0,
        totalTime: Date.now() - startTime
      };
    }
    
    const variants = this.generateVariants(originalUrl);
    logger.info({ variantCount: variants.length, variants }, 'Starting URL canonicalization');
    
    const attempts = [];
    let lastError = null;
    
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const attemptStart = Date.now();
      
      logger.debug({ variant, attempt: i + 1 }, 'Testing URL variant');
      
      try {
        const result = await this.testVariant(variant, correlationId);
        const attemptTime = Date.now() - attemptStart;
        
        attempts.push({
          url: variant,
          success: result.success,
          status: result.status,
          responseTime: result.responseTime,
          error: result.error,
          errorClass: result.errorClass,
          method: result.method,
          redirectChain: result.redirectChain,
          finalUrl: result.finalUrl,
          attemptTime
        });
        
        if (result.success && result.status < 400) {
          // Success! Return the canonicalized result
          const totalTime = Date.now() - startTime;
          
          logger.info({
            originalUrl,
            canonicalUrl: result.finalUrl,
            status: result.status,
            attempts: i + 1,
            totalTime,
            redirectChain: result.redirectChain
          }, 'URL canonicalization successful');
          
          return {
            success: true,
            originalUrl,
            canonicalUrl: result.finalUrl,
            status: result.status,
            redirectChain: result.redirectChain,
            attempts: attempts,
            totalTime,
            headers: result.headers
          };
        }
        
        lastError = result.error || `HTTP ${result.status}`;
        
        // Add backoff delay between attempts
        if (i < variants.length - 1) {
          const backoffMs = this.options.backoffMs[Math.min(i, this.options.backoffMs.length - 1)];
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        
      } catch (error) {
        const attemptTime = Date.now() - attemptStart;
        const errorClass = this.classifyError(error);
        
        attempts.push({
          url: variant,
          success: false,
          error: error.message,
          errorClass,
          attemptTime
        });
        
        lastError = error.message;
        logger.debug({ variant, error: error.message, errorClass }, 'Variant failed');
      }
    }
    
    // All variants failed
    const totalTime = Date.now() - startTime;
    
    logger.warn({
      originalUrl,
      attempts: attempts.length,
      totalTime,
      lastError
    }, 'URL canonicalization failed - all variants failed');
    
    return {
      success: false,
      originalUrl,
      error: lastError || 'All variants failed',
      errorClass: attempts[attempts.length - 1]?.errorClass || 'unknown',
      attempts,
      totalTime
    };
  }

  /**
   * Batch canonicalize multiple URLs
   * @param {Array<string>} urls - Array of URLs to canonicalize
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Array<Object>>} Array of canonicalization results
   */
  async canonicalizeBatch(urls, correlationId) {
    const logger = this.logger.child({ correlationId, urlCount: urls.length });
    logger.info('Starting batch URL canonicalization');
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      logger.debug({ url, progress: `${i + 1}/${urls.length}` }, 'Canonicalizing URL');
      
      try {
        const result = await this.canonicalize(url, correlationId);
        results.push(result);
        
        // Add small delay between URLs to be respectful
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        logger.error({ url, error: error.message }, 'Error during batch canonicalization');
        results.push({
          success: false,
          originalUrl: url,
          error: error.message,
          errorClass: 'batch_error',
          attempts: [],
          totalTime: 0
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    logger.info({
      totalUrls: urls.length,
      successCount,
      failureCount: urls.length - successCount,
      totalTime
    }, 'Batch URL canonicalization completed');
    
    return results;
  }
}

module.exports = { URLCanonicalizer };