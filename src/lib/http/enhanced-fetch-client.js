/**
 * Enhanced Fetch Client for EdgeScraperPro
 * 
 * Features:
 * - Browser-like headers with realistic User-Agent
 * - Robots.txt compliance checking
 * - URL canonicalization integration
 * - Pagination discovery integration
 * - Structured error reporting
 * - Cookie jar and session management
 */

const { URL } = require('url');
const createLogger = require('./logging');
const { UrlCanonicalizer } = require('./url-canonicalizer');
const { PaginationDiscovery } = require('../pagination-discovery');

class EnhancedFetchClient {
  constructor(options = {}) {
    this.logger = createLogger('enhanced-fetch-client');
    this.options = {
      timeout: options.timeout || 30000,
      maxRedirects: options.maxRedirects || 5,
      respectRobots: options.respectRobots !== false,
      enableCanonicalization: options.enableCanonicalization !== false,
      enablePaginationDiscovery: options.enablePaginationDiscovery !== false,
      consecutiveErrorThreshold: options.consecutiveErrorThreshold || 3,
      rateLimitPerSecond: options.rateLimitPerSecond || 2,
      jitterMs: options.jitterMs || 500,
      ...options
    };

    // Initialize components
    this.canonicalizer = new UrlCanonicalizer({
      maxVariants: 4,
      preflightTimeout: 5000,
      backoffDelays: [500, 1000, 2000]
    });

    this.paginationDiscovery = new PaginationDiscovery({
      paginationMode: 'auto',
      maxConsecutive404s: 3,
      maxPagesToDiscover: 50
    });

    // Robots.txt cache
    this.robotsCache = new Map();
    this.robotsCacheMaxAge = 60 * 60 * 1000; // 1 hour

    // Session management
    this.cookieJar = new Map();
    this.sessionHeaders = new Map();

    // Rate limiting
    this.hostLastRequest = new Map();
    this.consecutiveErrors = new Map();

    // Browser-like headers
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 EdgeScraperPro/2.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  /**
   * Check robots.txt for URL
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} Whether URL is allowed
   */
  async checkRobotsTxt(url) {
    if (!this.options.respectRobots) {
      return true;
    }

    try {
      const parsed = new URL(url);
      const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
      const cacheKey = robotsUrl;

      // Check cache first
      const cached = this.robotsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.robotsCacheMaxAge) {
        return this.isPathAllowed(cached.content, parsed.pathname, this.defaultHeaders['User-Agent']);
      }

      // Fetch robots.txt
      this.logger.debug({ robotsUrl }, 'Fetching robots.txt');
      
      const response = await this.baseFetch(robotsUrl, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'User-Agent': this.defaultHeaders['User-Agent']
        }
      });

      let robotsContent = '';
      if (response.ok) {
        robotsContent = await response.text();
      }

      // Cache the result
      this.robotsCache.set(cacheKey, {
        content: robotsContent,
        timestamp: Date.now()
      });

      return this.isPathAllowed(robotsContent, parsed.pathname, this.defaultHeaders['User-Agent']);

    } catch (error) {
      this.logger.warn({ url, error: error.message }, 'Failed to check robots.txt, allowing by default');
      return true; // Allow by default if robots.txt check fails
    }
  }

  /**
   * Parse robots.txt and check if path is allowed
   * @param {string} robotsContent - robots.txt content
   * @param {string} path - Path to check
   * @param {string} userAgent - User agent string
   * @returns {boolean} Whether path is allowed
   */
  isPathAllowed(robotsContent, path, userAgent) {
    if (!robotsContent) return true;

    const lines = robotsContent.split('\n').map(line => line.trim());
    let currentUserAgent = null;
    let isRelevantSection = false;
    
    for (const line of lines) {
      if (line.startsWith('#') || !line) continue;

      if (line.toLowerCase().startsWith('user-agent:')) {
        const ua = line.substring(11).trim();
        currentUserAgent = ua;
        isRelevantSection = (ua === '*' || userAgent.includes(ua));
        continue;
      }

      if (!isRelevantSection) continue;

      if (line.toLowerCase().startsWith('disallow:')) {
        const disallowedPath = line.substring(9).trim();
        if (disallowedPath && path.startsWith(disallowedPath)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Apply rate limiting
   * @param {string} hostname - Hostname to rate limit
   */
  async applyRateLimit(hostname) {
    const now = Date.now();
    const lastRequest = this.hostLastRequest.get(hostname) || 0;
    const minInterval = 1000 / this.options.rateLimitPerSecond;
    const elapsed = now - lastRequest;

    if (elapsed < minInterval) {
      const delay = minInterval - elapsed + Math.random() * this.options.jitterMs;
      this.logger.debug({ hostname, delay }, 'Applying rate limit delay');
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.hostLastRequest.set(hostname, Date.now());
  }

  /**
   * Check consecutive error threshold
   * @param {string} hostname - Hostname to check
   * @returns {boolean} Whether to continue attempting requests
   */
  shouldContinueRequests(hostname) {
    const errorCount = this.consecutiveErrors.get(hostname) || 0;
    return errorCount < this.options.consecutiveErrorThreshold;
  }

  /**
   * Record request result for error tracking
   * @param {string} hostname - Hostname
   * @param {boolean} success - Whether request succeeded
   */
  recordRequestResult(hostname, success) {
    if (success) {
      this.consecutiveErrors.delete(hostname);
    } else {
      const current = this.consecutiveErrors.get(hostname) || 0;
      this.consecutiveErrors.set(hostname, current + 1);
    }
  }

  /**
   * Base fetch implementation
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options
   * @returns {Promise<Response>} Response object
   */
  async baseFetch(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.options.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.defaultHeaders,
          ...options.headers
        }
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${options.timeout || this.options.timeout}ms`);
        timeoutError.code = 'ETIMEDOUT';
        throw timeoutError;
      }
      
      throw error;
    }
  }

  /**
   * Enhanced fetch with canonicalization and error handling
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Enhanced response with metadata
   */
  async enhancedFetch(url, options = {}) {
    const startTime = Date.now();
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Check consecutive error threshold
    if (!this.shouldContinueRequests(hostname)) {
      const error = new Error(`Skipping request due to ${this.options.consecutiveErrorThreshold} consecutive errors`);
      error.code = 'CONSECUTIVE_ERRORS';
      throw error;
    }

    // Apply rate limiting
    await this.applyRateLimit(hostname);

    // Check robots.txt
    const robotsAllowed = await this.checkRobotsTxt(url);
    if (!robotsAllowed) {
      const error = new Error('Request blocked by robots.txt');
      error.code = 'BLOCKED_BY_ROBOTS';
      error.status = 403;
      throw error;
    }

    let response;
    let canonicalizationResult = null;
    let originalUrl = url;
    let resolvedUrl = url;

    try {
      // Add referer header
      const requestHeaders = {
        ...options.headers,
        'Referer': `${parsed.protocol}//${parsed.host}/`
      };

      // First attempt with original URL
      this.logger.debug({ url }, 'Attempting original URL');
      
      response = await this.baseFetch(url, {
        ...options,
        headers: requestHeaders
      });

      if (response.ok) {
        this.recordRequestResult(hostname, true);
        
        return {
          response,
          originalUrl,
          resolvedUrl,
          canonicalizationResult,
          robotsAllowed: true,
          responseTime: Date.now() - startTime,
          fromCache: false
        };
      }

      // If we get a 404 and canonicalization is enabled, try variants
      if (response.status === 404 && this.options.enableCanonicalization) {
        this.logger.info({ url, status: response.status }, 'Original URL failed, attempting canonicalization');
        
        canonicalizationResult = await this.canonicalizer.canonicalizeUrl(url, (variantUrl, variantOptions) => {
          return this.baseFetch(variantUrl, {
            ...options,
            ...variantOptions,
            headers: {
              ...requestHeaders,
              'Referer': `${new URL(variantUrl).protocol}//${new URL(variantUrl).host}/`
            }
          });
        });

        if (canonicalizationResult.success) {
          resolvedUrl = canonicalizationResult.canonicalUrl;
          
          // Fetch the canonical URL
          response = await this.baseFetch(resolvedUrl, {
            ...options,
            headers: {
              ...requestHeaders,
              'Referer': `${new URL(resolvedUrl).protocol}//${new URL(resolvedUrl).host}/`
            }
          });

          this.logger.info({ 
            originalUrl, 
            resolvedUrl, 
            attempts: canonicalizationResult.attempts.length 
          }, 'URL canonicalization successful');
        }
      }

      // Record result
      this.recordRequestResult(hostname, response.ok);

      return {
        response,
        originalUrl,
        resolvedUrl,
        canonicalizationResult,
        robotsAllowed: true,
        responseTime: Date.now() - startTime,
        fromCache: false
      };

    } catch (error) {
      this.recordRequestResult(hostname, false);
      
      // Enhance error with additional context
      error.originalUrl = originalUrl;
      error.resolvedUrl = resolvedUrl;
      error.canonicalizationResult = canonicalizationResult;
      error.responseTime = Date.now() - startTime;
      
      throw error;
    }
  }

  /**
   * Batch fetch with pagination discovery
   * @param {Array<string>} urls - URLs to fetch
   * @param {object} options - Batch options
   * @returns {Promise<object>} Batch result with discovered pagination
   */
  async batchFetchWithDiscovery(urls, options = {}) {
    const results = {
      originalUrls: urls,
      responses: [],
      discoveredUrls: [],
      paginationResults: [],
      summary: {
        total: urls.length,
        successful: 0,
        failed: 0,
        canonicalized: 0,
        robotsBlocked: 0,
        paginationDiscovered: 0
      }
    };

    for (const url of urls) {
      try {
        this.logger.info({ url }, 'Processing URL');
        
        const result = await this.enhancedFetch(url, options);
        results.responses.push({
          url,
          success: true,
          ...result
        });
        
        results.summary.successful++;
        
        if (result.canonicalizationResult?.success) {
          results.summary.canonicalized++;
        }

        // Attempt pagination discovery if enabled and response is successful
        if (this.options.enablePaginationDiscovery && result.response.ok) {
          try {
            const html = await result.response.text();
            const paginationResult = await this.paginationDiscovery.discoverPagination(
              result.resolvedUrl, 
              (paginationUrl, paginationOptions) => this.baseFetch(paginationUrl, paginationOptions)
            );

            if (paginationResult.success && paginationResult.validUrls.length > 1) {
              results.discoveredUrls.push(...paginationResult.validUrls);
              results.paginationResults.push(paginationResult);
              results.summary.paginationDiscovered++;
              
              this.logger.info({ 
                url: result.resolvedUrl,
                discoveredUrls: paginationResult.validUrls.length,
                mode: paginationResult.mode 
              }, 'Pagination discovery successful');
            }
          } catch (paginationError) {
            this.logger.warn({ 
              url, 
              error: paginationError.message 
            }, 'Pagination discovery failed');
          }
        }

      } catch (error) {
        results.responses.push({
          url,
          success: false,
          error: error.message,
          errorCode: error.code,
          status: error.status,
          originalUrl: error.originalUrl,
          resolvedUrl: error.resolvedUrl,
          canonicalizationResult: error.canonicalizationResult,
          responseTime: error.responseTime
        });
        
        results.summary.failed++;
        
        if (error.code === 'BLOCKED_BY_ROBOTS') {
          results.summary.robotsBlocked++;
        }
      }
    }

    this.logger.info(results.summary, 'Batch fetch completed');
    return results;
  }

  /**
   * Get client statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      robotsCacheSize: this.robotsCache.size,
      consecutiveErrors: Object.fromEntries(this.consecutiveErrors),
      canonicalizer: this.canonicalizer.getStats(),
      paginationDiscovery: this.paginationDiscovery.getStats()
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.robotsCache.clear();
    this.consecutiveErrors.clear();
    this.canonicalizer.clearCache();
    this.paginationDiscovery.clearCache();
    this.logger.debug('Cleared all caches');
  }
}

module.exports = { EnhancedFetchClient };