const { JSDOM } = require('jsdom');
const { fetchWithPolicy } = require('./enhanced-client');
const { URLCanonicalizer } = require('./url-canonicalizer');
const { NetworkError, ValidationError } = require('./errors');
const createLogger = require('./logging');

/**
 * Pagination Discovery - Automatically discovers pagination patterns and valid page ranges
 * 
 * This module implements intelligent pagination discovery to handle:
 * - Auto-detection of pagination links and patterns
 * - Fallback to letter-based indexing when numeric pagination fails
 * - Consecutive 404 detection to avoid infinite loops
 * - Support for different pagination modes (auto, range, letters)
 */
class PaginationDiscovery {
  constructor(options = {}) {
    this.options = {
      mode: options.mode || 'auto', // 'auto', 'range', 'letters'
      maxPages: options.maxPages || 1000,
      consecutive404Threshold: options.consecutive404Threshold || 5,
      pageRange: options.pageRange || { start: 1, end: 50 },
      letterIndexes: options.letterIndexes || 'abcdefghijklmnopqrstuvwxyz0123456789',
      timeout: options.timeout || 10000,
      userAgent: options.userAgent || 'EdgeScraper/2.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)',
      ...options
    };
    
    this.logger = createLogger('pagination-discovery');
    this.canonicalizer = new URLCanonicalizer({
      timeout: this.options.timeout,
      userAgent: this.options.userAgent
    });
    
    // Pagination selectors to try (in order of preference)
    this.paginationSelectors = [
      'nav.pagination a[rel="next"]',
      'nav.pagination a[aria-label*="Next"]',
      'ul.pagination a[rel="next"]',
      'ul.pagination a[aria-label*="Next"]',
      '.pagination a[rel="next"]',
      '.pagination a[aria-label*="Next"]',
      'a[rel="next"]',
      'a[aria-label*="Next"]',
      'a[href*="page"]',
      '.pager a[href*="page"]',
      'nav a[href*="page"]',
      '.page-numbers a[href*="page"]',
      '.pagination a[href*="page"]'
    ];
  }

  /**
   * Extract page number from URL
   * @param {string} url - URL to extract page number from
   * @param {string} basePattern - Base pattern to match against
   * @returns {number|null} Page number or null if not found
   */
  extractPageNumber(url, basePattern) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Try to match common pagination patterns
      const patterns = [
        /\/page\/(\d+)/,
        /\/p\/(\d+)/,
        /\/page-(\d+)/,
        /\/p-(\d+)/,
        /[?&]page=(\d+)/,
        /[?&]p=(\d+)/,
        /[?&]pagenum=(\d+)/,
        /[?&]pagenumber=(\d+)/
      ];
      
      for (const pattern of patterns) {
        const match = pathname.match(pattern) || urlObj.search.match(pattern);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.debug({ url, error: error.message }, 'Failed to extract page number');
      return null;
    }
  }

  /**
   * Generate page URL from base URL and page number
   * @param {string} baseUrl - Base URL pattern
   * @param {number} pageNumber - Page number to generate
   * @returns {string} Generated page URL
   */
  generatePageUrl(baseUrl, pageNumber) {
    try {
      const urlObj = new URL(baseUrl);
      const pathname = urlObj.pathname;
      
      // Replace existing page number in path
      let newPathname = pathname.replace(/\/page\/\d+/, `/page/${pageNumber}`);
      
      // If no existing page pattern, add it
      if (newPathname === pathname) {
        if (pathname.endsWith('/')) {
          newPathname = `${pathname}page/${pageNumber}`;
        } else {
          newPathname = `${pathname}/page/${pageNumber}`;
        }
      }
      
      return `${urlObj.protocol}//${urlObj.host}${newPathname}${urlObj.search}${urlObj.hash}`;
    } catch (error) {
      this.logger.error({ baseUrl, pageNumber, error: error.message }, 'Failed to generate page URL');
      return baseUrl;
    }
  }

  /**
   * Generate letter-indexed URL
   * @param {string} baseUrl - Base URL pattern
   * @param {string} letter - Letter to use for indexing
   * @param {number} pageNumber - Page number (default 1)
   * @returns {string} Generated letter-indexed URL
   */
  generateLetterUrl(baseUrl, letter, pageNumber = 1) {
    try {
      const urlObj = new URL(baseUrl);
      const pathname = urlObj.pathname;
      
      // Replace 'all' with letter in the path
      let newPathname = pathname.replace(/\/filter\/all\//, `/filter/${letter}/`);
      
      // Ensure page number is set
      newPathname = newPathname.replace(/\/page\/\d+/, `/page/${pageNumber}`);
      if (!newPathname.includes('/page/')) {
        if (newPathname.endsWith('/')) {
          newPathname = `${newPathname}page/${pageNumber}`;
        } else {
          newPathname = `${newPathname}/page/${pageNumber}`;
        }
      }
      
      return `${urlObj.protocol}//${urlObj.host}${newPathname}${urlObj.search}${urlObj.hash}`;
    } catch (error) {
      this.logger.error({ baseUrl, letter, pageNumber, error: error.message }, 'Failed to generate letter URL');
      return baseUrl;
    }
  }

  /**
   * Parse HTML content to find pagination links
   * @param {string} html - HTML content to parse
   * @param {string} baseUrl - Base URL for resolving relative links
   * @returns {Object} Pagination information
   */
  parsePagination(html, baseUrl) {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const paginationInfo = {
        hasNext: false,
        hasPrevious: false,
        currentPage: null,
        totalPages: null,
        nextUrl: null,
        previousUrl: null,
        pageLinks: [],
        lastPage: null
      };
      
      // Try different pagination selectors
      for (const selector of this.paginationSelectors) {
        const links = document.querySelectorAll(selector);
        
        for (const link of links) {
          const href = link.getAttribute('href');
          const text = link.textContent.trim();
          const rel = link.getAttribute('rel');
          const ariaLabel = link.getAttribute('aria-label') || '';
          
          if (!href) continue;
          
          // Resolve relative URLs
          let fullUrl;
          try {
            fullUrl = new URL(href, baseUrl).toString();
          } catch {
            continue;
          }
          
          // Check for next page
          if (rel === 'next' || ariaLabel.toLowerCase().includes('next') || text.toLowerCase().includes('next')) {
            paginationInfo.hasNext = true;
            paginationInfo.nextUrl = fullUrl;
          }
          
          // Check for previous page
          if (rel === 'prev' || ariaLabel.toLowerCase().includes('previous') || text.toLowerCase().includes('previous')) {
            paginationInfo.hasPrevious = true;
            paginationInfo.previousUrl = fullUrl;
          }
          
          // Extract page numbers
          const pageNum = this.extractPageNumber(fullUrl, baseUrl);
          if (pageNum !== null) {
            paginationInfo.pageLinks.push({
              url: fullUrl,
              pageNumber: pageNum,
              text: text
            });
            
            if (pageNum > (paginationInfo.lastPage || 0)) {
              paginationInfo.lastPage = pageNum;
            }
          }
        }
        
        // If we found pagination info, break
        if (paginationInfo.hasNext || paginationInfo.pageLinks.length > 0) {
          break;
        }
      }
      
      // Try to find current page from URL or page indicators
      const currentPageSelectors = [
        '.pagination .current',
        '.pagination .active',
        '.pagination .selected',
        '.page-numbers .current',
        '.page-numbers .active',
        '.page-numbers .selected'
      ];
      
      for (const selector of currentPageSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent.trim();
          const pageNum = parseInt(text, 10);
          if (!isNaN(pageNum)) {
            paginationInfo.currentPage = pageNum;
            break;
          }
        }
      }
      
      // If no current page found, try to extract from URL
      if (!paginationInfo.currentPage) {
        paginationInfo.currentPage = this.extractPageNumber(baseUrl, baseUrl) || 1;
      }
      
      return paginationInfo;
      
    } catch (error) {
      this.logger.error({ error: error.message, baseUrl }, 'Failed to parse pagination');
      return {
        hasNext: false,
        hasPrevious: false,
        currentPage: 1,
        totalPages: null,
        nextUrl: null,
        previousUrl: null,
        pageLinks: [],
        lastPage: null
      };
    }
  }

  /**
   * Test if a page URL is accessible
   * @param {string} url - URL to test
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Object>} Test result
   */
  async testPage(url, correlationId) {
    try {
      const result = await this.canonicalizer.canonicalize(url, correlationId);
      
      if (result.success && result.status < 400) {
        return {
          success: true,
          url: result.canonicalUrl,
          status: result.status,
          responseTime: result.totalTime
        };
      } else {
        return {
          success: false,
          url: url,
          status: result.status,
          error: result.error,
          errorClass: result.errorClass
        };
      }
    } catch (error) {
      return {
        success: false,
        url: url,
        error: error.message,
        errorClass: 'test_error'
      };
    }
  }

  /**
   * Discover pagination for a given base URL
   * @param {string} baseUrl - Base URL to discover pagination for
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Object>} Pagination discovery result
   */
  async discoverPagination(baseUrl, correlationId) {
    const logger = this.logger.child({ correlationId, baseUrl });
    logger.info('Starting pagination discovery');
    
    const startTime = Date.now();
    const discoveryResult = {
      success: false,
      baseUrl,
      mode: this.options.mode,
      discoveredPages: [],
      totalPages: 0,
      paginationInfo: null,
      errors: [],
      totalTime: 0
    };
    
    try {
      // First, canonicalize the base URL
      const canonicalResult = await this.canonicalizer.canonicalize(baseUrl, correlationId);
      
      if (!canonicalResult.success) {
        discoveryResult.errors.push({
          type: 'canonicalization_failed',
          error: canonicalResult.error,
          errorClass: canonicalResult.errorClass
        });
        return discoveryResult;
      }
      
      const canonicalUrl = canonicalResult.canonicalUrl;
      discoveryResult.baseUrl = canonicalUrl;
      
      // Test the base page
      const baseTest = await this.testPage(canonicalUrl, correlationId);
      if (!baseTest.success) {
        discoveryResult.errors.push({
          type: 'base_page_failed',
          error: baseTest.error,
          errorClass: baseTest.errorClass
        });
        return discoveryResult;
      }
      
      discoveryResult.discoveredPages.push({
        url: baseTest.url,
        pageNumber: 1,
        status: baseTest.status,
        responseTime: baseTest.responseTime
      });
      
      // Fetch the base page content to parse pagination
      const response = await fetchWithPolicy(canonicalUrl, {
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
      
      const html = await response.text();
      const paginationInfo = this.parsePagination(html, canonicalUrl);
      discoveryResult.paginationInfo = paginationInfo;
      
      // If we found pagination info, try to discover more pages
      if (paginationInfo.hasNext || paginationInfo.pageLinks.length > 0) {
        await this.discoverNumericPages(discoveryResult, canonicalUrl, correlationId);
      } else {
        // Fallback to letter-based discovery
        logger.info('No pagination found, trying letter-based discovery');
        await this.discoverLetterPages(discoveryResult, canonicalUrl, correlationId);
      }
      
      discoveryResult.success = discoveryResult.discoveredPages.length > 0;
      discoveryResult.totalPages = discoveryResult.discoveredPages.length;
      discoveryResult.totalTime = Date.now() - startTime;
      
      logger.info({
        success: discoveryResult.success,
        totalPages: discoveryResult.totalPages,
        totalTime: discoveryResult.totalTime
      }, 'Pagination discovery completed');
      
      return discoveryResult;
      
    } catch (error) {
      logger.error({ error: error.message }, 'Pagination discovery failed');
      discoveryResult.errors.push({
        type: 'discovery_error',
        error: error.message,
        errorClass: 'discovery_error'
      });
      discoveryResult.totalTime = Date.now() - startTime;
      return discoveryResult;
    }
  }

  /**
   * Discover numeric pagination pages
   * @param {Object} discoveryResult - Discovery result object to update
   * @param {string} baseUrl - Base URL
   * @param {string} correlationId - Request correlation ID
   */
  async discoverNumericPages(discoveryResult, baseUrl, correlationId) {
    const logger = this.logger.child({ correlationId, baseUrl });
    let consecutive404s = 0;
    let currentPage = 2; // Start from page 2 since page 1 is already tested
    
    logger.info('Starting numeric pagination discovery');
    
    while (currentPage <= this.options.maxPages && consecutive404s < this.options.consecutive404Threshold) {
      const pageUrl = this.generatePageUrl(baseUrl, currentPage);
      
      try {
        const testResult = await this.testPage(pageUrl, correlationId);
        
        if (testResult.success) {
          discoveryResult.discoveredPages.push({
            url: testResult.url,
            pageNumber: currentPage,
            status: testResult.status,
            responseTime: testResult.responseTime
          });
          consecutive404s = 0; // Reset counter on success
          
          logger.debug({ pageNumber: currentPage, url: testResult.url }, 'Page discovered');
        } else {
          consecutive404s++;
          discoveryResult.errors.push({
            type: 'page_failed',
            pageNumber: currentPage,
            url: pageUrl,
            error: testResult.error,
            errorClass: testResult.errorClass
          });
          
          logger.debug({ pageNumber: currentPage, error: testResult.error }, 'Page failed');
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        consecutive404s++;
        discoveryResult.errors.push({
          type: 'page_error',
          pageNumber: currentPage,
          url: pageUrl,
          error: error.message,
          errorClass: 'page_error'
        });
        
        logger.debug({ pageNumber: currentPage, error: error.message }, 'Page error');
      }
      
      currentPage++;
    }
    
    if (consecutive404s >= this.options.consecutive404Threshold) {
      logger.info({ consecutive404s, lastPage: currentPage - 1 }, 'Stopped due to consecutive 404s');
    }
  }

  /**
   * Discover letter-based pagination pages
   * @param {Object} discoveryResult - Discovery result object to update
   * @param {string} baseUrl - Base URL
   * @param {string} correlationId - Request correlation ID
   */
  async discoverLetterPages(discoveryResult, baseUrl, correlationId) {
    const logger = this.logger.child({ correlationId, baseUrl });
    logger.info('Starting letter-based pagination discovery');
    
    for (const letter of this.options.letterIndexes) {
      const letterUrl = this.generateLetterUrl(baseUrl, letter, 1);
      
      try {
        const testResult = await this.testPage(letterUrl, correlationId);
        
        if (testResult.success) {
          discoveryResult.discoveredPages.push({
            url: testResult.url,
            pageNumber: 1,
            letter: letter,
            status: testResult.status,
            responseTime: testResult.responseTime
          });
          
          logger.debug({ letter, url: testResult.url }, 'Letter page discovered');
          
          // Try to discover more pages for this letter
          await this.discoverNumericPagesForLetter(discoveryResult, letterUrl, letter, correlationId);
        } else {
          discoveryResult.errors.push({
            type: 'letter_page_failed',
            letter: letter,
            url: letterUrl,
            error: testResult.error,
            errorClass: testResult.errorClass
          });
          
          logger.debug({ letter, error: testResult.error }, 'Letter page failed');
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        discoveryResult.errors.push({
          type: 'letter_page_error',
          letter: letter,
          url: letterUrl,
          error: error.message,
          errorClass: 'letter_page_error'
        });
        
        logger.debug({ letter, error: error.message }, 'Letter page error');
      }
    }
  }

  /**
   * Discover numeric pages for a specific letter
   * @param {Object} discoveryResult - Discovery result object to update
   * @param {string} letterBaseUrl - Base URL for the letter
   * @param {string} letter - Letter being processed
   * @param {string} correlationId - Request correlation ID
   */
  async discoverNumericPagesForLetter(discoveryResult, letterBaseUrl, letter, correlationId) {
    const logger = this.logger.child({ correlationId, letterBaseUrl, letter });
    let consecutive404s = 0;
    let currentPage = 2; // Start from page 2 since page 1 is already tested
    
    logger.debug('Starting numeric pagination discovery for letter');
    
    while (currentPage <= 10 && consecutive404s < 3) { // Limit to 10 pages per letter
      const pageUrl = this.generatePageUrl(letterBaseUrl, currentPage);
      
      try {
        const testResult = await this.testPage(pageUrl, correlationId);
        
        if (testResult.success) {
          discoveryResult.discoveredPages.push({
            url: testResult.url,
            pageNumber: currentPage,
            letter: letter,
            status: testResult.status,
            responseTime: testResult.responseTime
          });
          consecutive404s = 0; // Reset counter on success
          
          logger.debug({ letter, pageNumber: currentPage, url: testResult.url }, 'Letter page discovered');
        } else {
          consecutive404s++;
          discoveryResult.errors.push({
            type: 'letter_page_failed',
            letter: letter,
            pageNumber: currentPage,
            url: pageUrl,
            error: testResult.error,
            errorClass: testResult.errorClass
          });
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        consecutive404s++;
        discoveryResult.errors.push({
          type: 'letter_page_error',
          letter: letter,
          pageNumber: currentPage,
          url: pageUrl,
          error: error.message,
          errorClass: 'letter_page_error'
        });
      }
      
      currentPage++;
    }
  }

  /**
   * Batch discover pagination for multiple base URLs
   * @param {Array<string>} baseUrls - Array of base URLs to discover pagination for
   * @param {string} correlationId - Request correlation ID
   * @returns {Promise<Array<Object>>} Array of discovery results
   */
  async discoverPaginationBatch(baseUrls, correlationId) {
    const logger = this.logger.child({ correlationId, urlCount: baseUrls.length });
    logger.info('Starting batch pagination discovery');
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < baseUrls.length; i++) {
      const baseUrl = baseUrls[i];
      logger.debug({ baseUrl, progress: `${i + 1}/${baseUrls.length}` }, 'Discovering pagination');
      
      try {
        const result = await this.discoverPagination(baseUrl, correlationId);
        results.push(result);
        
        // Add delay between URLs
        if (i < baseUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        logger.error({ baseUrl, error: error.message }, 'Error during batch pagination discovery');
        results.push({
          success: false,
          baseUrl,
          mode: this.options.mode,
          discoveredPages: [],
          totalPages: 0,
          paginationInfo: null,
          errors: [{
            type: 'batch_error',
            error: error.message,
            errorClass: 'batch_error'
          }],
          totalTime: 0
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const totalPages = results.reduce((sum, r) => sum + r.totalPages, 0);
    
    logger.info({
      totalUrls: baseUrls.length,
      successCount,
      failureCount: baseUrls.length - successCount,
      totalPages,
      totalTime
    }, 'Batch pagination discovery completed');
    
    return results;
  }
}

module.exports = { PaginationDiscovery };