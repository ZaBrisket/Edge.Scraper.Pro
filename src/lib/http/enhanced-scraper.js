const { fetchWithPolicy } = require('./enhanced-client');
const { URLCanonicalizer } = require('./url-canonicalizer');
const { PaginationDiscovery } = require('./pagination-discovery');
const { StructuredLogger } = require('./structured-logger');
const { NetworkError, ValidationError } = require('./errors');
const { randomUUID } = require('crypto');

/**
 * Enhanced Scraper - Main scraper with URL normalization and pagination discovery
 * 
 * This module integrates all the enhanced features:
 * - URL canonicalization with automatic HTTP→HTTPS upgrades
 * - Pagination discovery with fallback to letter indexes
 * - Structured logging with error taxonomy
 * - Hardened fetch with browser-like headers
 * - Robots.txt respect and rate limiting
 */
class EnhancedScraper {
  constructor(options = {}) {
    this.options = {
      jobId: options.jobId || randomUUID(),
      enableCanonicalization: options.enableCanonicalization !== false,
      enablePaginationDiscovery: options.enablePaginationDiscovery !== false,
      enableStructuredLogging: options.enableStructuredLogging !== false,
      logDir: options.logDir || './logs',
      maxPages: options.maxPages || 1000,
      consecutive404Threshold: options.consecutive404Threshold || 5,
      timeout: options.timeout || 10000,
      userAgent: options.userAgent || 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      ...options
    };
    
    // Initialize components
    this.logger = new StructuredLogger({
      jobId: this.options.jobId,
      logDir: this.options.logDir,
      enableFileLogging: this.options.enableStructuredLogging,
      enableConsoleLogging: true
    });
    
    this.canonicalizer = new URLCanonicalizer({
      timeout: this.options.timeout,
      userAgent: this.options.userAgent
    });
    
    this.paginationDiscovery = new PaginationDiscovery({
      mode: 'auto',
      maxPages: this.options.maxPages,
      consecutive404Threshold: this.options.consecutive404Threshold,
      timeout: this.options.timeout,
      userAgent: this.options.userAgent
    });
    
    // Track scraping session
    this.session = {
      startTime: Date.now(),
      totalUrls: 0,
      successfulUrls: 0,
      failedUrls: 0,
      discoveredPages: 0,
      canonicalizedUrls: 0
    };
    
    this.logger.logSummary({
      message: 'Enhanced scraper initialized',
      options: this.options
    });
  }

  /**
   * Scrape a single URL with full enhancement pipeline
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping result
   */
  async scrapeUrl(url, options = {}) {
    const correlationId = options.correlationId || randomUUID();
    const logger = this.logger.child({ correlationId, url });
    
    const result = {
      success: false,
      originalUrl: url,
      finalUrl: url,
      status: null,
      content: null,
      responseTime: 0,
      error: null,
      errorClass: null,
      canonicalization: null,
      pagination: null,
      attempts: [],
      timestamp: new Date().toISOString()
    };
    
    const startTime = Date.now();
    
    try {
      logger.logRequest({
        url,
        method: 'GET',
        userAgent: this.options.userAgent
      });
      
      // Step 1: Canonicalize URL if enabled
      if (this.options.enableCanonicalization) {
        logger.info('Starting URL canonicalization');
        const canonicalResult = await this.canonicalizer.canonicalize(url, correlationId);
        result.canonicalization = canonicalResult;
        
        if (canonicalResult.success) {
          result.finalUrl = canonicalResult.canonicalUrl;
          this.session.canonicalizedUrls++;
          logger.info({
            originalUrl: url,
            canonicalUrl: canonicalResult.canonicalUrl,
            status: canonicalResult.status
          }, 'URL canonicalized successfully');
        } else {
          logger.logError({
            url,
            error: {
              message: canonicalResult.error,
              errorClass: canonicalResult.errorClass
            },
            step: 'canonicalization'
          });
          result.error = canonicalResult.error;
          result.errorClass = canonicalResult.errorClass;
          result.attempts = canonicalResult.attempts;
          result.responseTime = Date.now() - startTime;
          return result;
        }
      }
      
      // Step 2: Fetch the page
      logger.info('Fetching page content');
      const response = await fetchWithPolicy(result.finalUrl, {
        method: 'GET',
        timeout: this.options.timeout,
        correlationId,
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      result.status = response.status;
      result.responseTime = Date.now() - startTime;
      
      if (response.ok) {
        result.content = await response.text();
        result.success = true;
        this.session.successfulUrls++;
        
        logger.logResponse({
          url: result.finalUrl,
          status: result.status,
          responseTime: result.responseTime,
          size: result.content.length,
          finalUrl: response.url,
          redirectChain: response.redirected ? [url, response.url] : []
        });
        
        // Step 3: Discover pagination if enabled
        if (this.options.enablePaginationDiscovery && result.content) {
          logger.info('Starting pagination discovery');
          const paginationResult = await this.paginationDiscovery.discoverPagination(result.finalUrl, correlationId);
          result.pagination = paginationResult;
          
          if (paginationResult.success) {
            this.session.discoveredPages += paginationResult.totalPages;
            logger.info({
              totalPages: paginationResult.totalPages,
              discoveredPages: paginationResult.discoveredPages.length
            }, 'Pagination discovery completed');
          } else {
            logger.logError({
              url: result.finalUrl,
              error: {
                message: 'Pagination discovery failed',
                errorClass: 'pagination_failed'
              },
              step: 'pagination_discovery'
            });
          }
        }
        
      } else {
        result.error = `HTTP ${response.status}`;
        result.errorClass = `http_${response.status}`;
        this.session.failedUrls++;
        
        logger.logError({
          url: result.finalUrl,
          error: {
            message: result.error,
            errorClass: result.errorClass,
            status: result.status
          },
          step: 'fetch'
        });
      }
      
    } catch (error) {
      result.error = error.message;
      result.errorClass = error.code || error.name || 'network_error';
      result.responseTime = Date.now() - startTime;
      this.session.failedUrls++;
      
      logger.logError({
        url: result.finalUrl || url,
        error: {
          message: error.message,
          errorClass: result.errorClass,
          stack: error.stack
        },
        step: 'scrape'
      });
    }
    
    this.session.totalUrls++;
    return result;
  }

  /**
   * Scrape multiple URLs with full enhancement pipeline
   * @param {Array<string>} urls - URLs to scrape
   * @param {Object} options - Scraping options
   * @returns {Promise<Array<Object>>} Array of scraping results
   */
  async scrapeUrls(urls, options = {}) {
    const correlationId = options.correlationId || randomUUID();
    const logger = this.logger.child({ correlationId, urlCount: urls.length });
    
    logger.logSummary({
      message: 'Starting batch scraping',
      totalUrls: urls.length,
      options: this.options
    });
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      logger.info({ url, progress: `${i + 1}/${urls.length}` }, 'Scraping URL');
      
      try {
        const result = await this.scrapeUrl(url, { ...options, correlationId });
        results.push(result);
        
        // Add delay between requests to be respectful
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        logger.logError({
          url,
          error: {
            message: error.message,
            errorClass: 'batch_error'
          },
          step: 'batch_scrape'
        });
        
        results.push({
          success: false,
          originalUrl: url,
          finalUrl: url,
          status: null,
          content: null,
          responseTime: 0,
          error: error.message,
          errorClass: 'batch_error',
          canonicalization: null,
          pagination: null,
          attempts: [],
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successfulCount = results.filter(r => r.success).length;
    const failedCount = results.length - successfulCount;
    
    logger.logSummary({
      message: 'Batch scraping completed',
      totalUrls: urls.length,
      successfulUrls: successfulCount,
      failedUrls: failedCount,
      totalTime,
      avgTimePerUrl: Math.round(totalTime / urls.length),
      discoveredPages: results.reduce((sum, r) => sum + (r.pagination?.totalPages || 0), 0)
    });
    
    return results;
  }

  /**
   * Scrape with pagination discovery for a base URL
   * @param {string} baseUrl - Base URL to scrape with pagination
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping result with pagination
   */
  async scrapeWithPagination(baseUrl, options = {}) {
    const correlationId = options.correlationId || randomUUID();
    const logger = this.logger.child({ correlationId, baseUrl });
    
    logger.logSummary({
      message: 'Starting pagination scraping',
      baseUrl,
      options: this.options
    });
    
    const result = {
      success: false,
      baseUrl,
      discoveredPages: [],
      totalPages: 0,
      paginationInfo: null,
      errors: [],
      totalTime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // First, canonicalize the base URL
      let canonicalUrl = baseUrl;
      if (this.options.enableCanonicalization) {
        const canonicalResult = await this.canonicalizer.canonicalize(baseUrl, correlationId);
        if (canonicalResult.success) {
          canonicalUrl = canonicalResult.canonicalUrl;
        } else {
          result.errors.push({
            type: 'canonicalization_failed',
            error: canonicalResult.error,
            errorClass: canonicalResult.errorClass
          });
          return result;
        }
      }
      
      // Discover pagination
      const paginationResult = await this.paginationDiscovery.discoverPagination(canonicalUrl, correlationId);
      
      if (paginationResult.success) {
        result.success = true;
        result.discoveredPages = paginationResult.discoveredPages;
        result.totalPages = paginationResult.totalPages;
        result.paginationInfo = paginationResult.paginationInfo;
        result.errors = paginationResult.errors;
        
        // Scrape each discovered page
        for (const page of paginationResult.discoveredPages) {
          try {
            const pageResult = await this.scrapeUrl(page.url, { ...options, correlationId });
            if (pageResult.success) {
              result.discoveredPages.push({
                ...page,
                content: pageResult.content,
                scraped: true
              });
            } else {
              result.discoveredPages.push({
                ...page,
                scraped: false,
                error: pageResult.error,
                errorClass: pageResult.errorClass
              });
            }
          } catch (error) {
            result.discoveredPages.push({
              ...page,
              scraped: false,
              error: error.message,
              errorClass: 'page_scrape_error'
            });
          }
        }
      } else {
        result.errors = paginationResult.errors;
      }
      
    } catch (error) {
      logger.logError({
        url: baseUrl,
        error: {
          message: error.message,
          errorClass: 'pagination_scrape_error'
        },
        step: 'pagination_scrape'
      });
      
      result.errors.push({
        type: 'pagination_scrape_error',
        error: error.message,
        errorClass: 'pagination_scrape_error'
      });
    }
    
    result.totalTime = Date.now() - startTime;
    
    logger.logSummary({
      message: 'Pagination scraping completed',
      baseUrl,
      success: result.success,
      totalPages: result.totalPages,
      discoveredPages: result.discoveredPages.length,
      totalTime: result.totalTime,
      errors: result.errors.length
    });
    
    return result;
  }

  /**
   * Get scraping session metrics
   * @returns {Object} Session metrics
   */
  getSessionMetrics() {
    const now = Date.now();
    const runtime = now - this.session.startTime;
    
    return {
      ...this.session,
      runtime,
      successRate: this.session.totalUrls > 0 
        ? (this.session.successfulUrls / this.session.totalUrls * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.session.totalUrls > 0 
        ? (this.session.failedUrls / this.session.totalUrls * 100).toFixed(2) + '%'
        : '0%',
      avgTimePerUrl: this.session.totalUrls > 0 
        ? Math.round(runtime / this.session.totalUrls)
        : 0
    };
  }

  /**
   * Get detailed metrics including logger metrics
   * @returns {Object} Detailed metrics
   */
  getDetailedMetrics() {
    return {
      session: this.getSessionMetrics(),
      logger: this.logger.getMetrics(),
      options: this.options
    };
  }

  /**
   * Export logs as NDJSON
   * @returns {string} NDJSON formatted logs
   */
  exportLogs() {
    return this.logger.exportLogsAsNDJSON();
  }

  /**
   * Get log file path
   * @returns {string} Log file path
   */
  getLogFilePath() {
    return this.logger.getLogFilePath();
  }

  /**
   * Reset session metrics
   */
  resetSession() {
    this.session = {
      startTime: Date.now(),
      totalUrls: 0,
      successfulUrls: 0,
      failedUrls: 0,
      discoveredPages: 0,
      canonicalizedUrls: 0
    };
    this.logger.resetMetrics();
  }
}

module.exports = { EnhancedScraper };