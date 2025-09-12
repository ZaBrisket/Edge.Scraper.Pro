/**
 * Pagination Discovery Module for EdgeScraperPro
 *
 * Automatically discovers pagination patterns from directory sites:
 * - Detects rel="next" links and pagination controls
 * - Falls back to letter-indexed discovery (a-z, 0-9)
 * - Supports configurable pagination modes
 * - Handles consecutive 404 breaking
 */

const { URL } = require('url');
const { JSDOM } = require('jsdom');
const createLogger = require('./http/logging');

class PaginationDiscovery {
  constructor(options = {}) {
    this.logger = createLogger('pagination-discovery');
    this.options = {
      paginationMode: options.paginationMode || 'auto', // 'auto', 'range', 'letters'
      maxConsecutive404s: options.maxConsecutive404s || 3,
      maxPagesToDiscover: options.maxPagesToDiscover || 100,
      letterIndexes: options.letterIndexes || [
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
        'k',
        'l',
        'm',
        'n',
        'o',
        'p',
        'q',
        'r',
        's',
        't',
        'u',
        'v',
        'w',
        'x',
        'y',
        'z',
      ],
      paginationSelectors: options.paginationSelectors || [
        'a[rel="next"]',
        'nav.pagination a',
        'ul.pagination a',
        '.pagination a',
        '[aria-label*="Next"]',
        '[aria-label*="next"]',
        'a:contains("Next")',
        'a:contains("›")',
        'a:contains("→")',
      ],
      ...options,
    };

    this.discoveryCache = new Map();
    this.cacheMaxAge = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Extract pagination information from HTML content
   * @param {string} html - HTML content to analyze
   * @param {string} baseUrl - Base URL for resolving relative links
   * @returns {object} Pagination info
   */
  extractPaginationFromHtml(html, baseUrl) {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const paginationInfo = {
        hasNext: false,
        nextUrl: null,
        pageNumbers: [],
        totalPages: null,
        currentPage: null,
      };

      // Look for rel="next" links (most reliable)
      const nextLink = document.querySelector('a[rel="next"]');
      if (nextLink && nextLink.href) {
        paginationInfo.hasNext = true;
        paginationInfo.nextUrl = new URL(nextLink.href, baseUrl).toString();
        this.logger.debug({ nextUrl: paginationInfo.nextUrl }, 'Found rel="next" link');
      }

      // Look for pagination controls if no rel="next"
      if (!paginationInfo.hasNext) {
        for (const selector of this.options.paginationSelectors) {
          const elements = document.querySelectorAll(selector);

          for (const element of elements) {
            const text = element.textContent?.trim().toLowerCase();
            const href = element.href;

            if (href && (text?.includes('next') || text === '›' || text === '→')) {
              paginationInfo.hasNext = true;
              paginationInfo.nextUrl = new URL(href, baseUrl).toString();
              this.logger.debug(
                {
                  selector,
                  nextUrl: paginationInfo.nextUrl,
                  text,
                },
                'Found next link via selector'
              );
              break;
            }
          }

          if (paginationInfo.hasNext) break;
        }
      }

      // Extract page numbers from pagination controls
      const paginationContainer = document.querySelector(
        '.pagination, nav.pagination, ul.pagination'
      );
      if (paginationContainer) {
        const pageLinks = paginationContainer.querySelectorAll('a');

        for (const link of pageLinks) {
          const text = link.textContent?.trim();
          const pageNum = parseInt(text);

          if (!isNaN(pageNum) && pageNum > 0) {
            paginationInfo.pageNumbers.push(pageNum);
          }
        }

        // Try to determine current page and total
        if (paginationInfo.pageNumbers.length > 0) {
          paginationInfo.totalPages = Math.max(...paginationInfo.pageNumbers);

          // Look for current/active page indicator
          const activePage = paginationContainer.querySelector(
            '.active, .current, [aria-current="page"]'
          );
          if (activePage) {
            const activePageNum = parseInt(activePage.textContent?.trim());
            if (!isNaN(activePageNum)) {
              paginationInfo.currentPage = activePageNum;
            }
          }
        }
      }

      // Look for "Page X of Y" text patterns
      const pageText = document.body.textContent || '';
      const pageOfMatch = pageText.match(/page\s+(\d+)\s+of\s+(\d+)/i);
      if (pageOfMatch) {
        paginationInfo.currentPage = parseInt(pageOfMatch[1]);
        paginationInfo.totalPages = parseInt(pageOfMatch[2]);
        this.logger.debug(
          {
            currentPage: paginationInfo.currentPage,
            totalPages: paginationInfo.totalPages,
          },
          'Found page info from text'
        );
      }

      return paginationInfo;
    } catch (error) {
      this.logger.warn({ error: error.message, baseUrl }, 'Failed to extract pagination from HTML');
      return {
        hasNext: false,
        nextUrl: null,
        pageNumbers: [],
        totalPages: null,
        currentPage: null,
      };
    }
  }

  /**
   * Discover pagination for a base URL pattern
   * @param {string} baseUrl - Base URL pattern (e.g., "https://site.com/filter/all/page/1")
   * @param {object} fetchClient - HTTP client to use
   * @returns {Promise<object>} Discovery result
   */
  async discoverPagination(baseUrl, fetchClient) {
    const cacheKey = this.extractUrlPattern(baseUrl);
    const cached = this.discoveryCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      this.logger.debug({ baseUrl, pattern: cacheKey }, 'Using cached pagination discovery');
      return cached.result;
    }

    this.logger.info(
      { baseUrl, mode: this.options.paginationMode },
      'Starting pagination discovery'
    );

    const result = {
      baseUrl,
      pattern: cacheKey,
      mode: this.options.paginationMode,
      success: false,
      validUrls: [],
      totalPages: null,
      letterIndexes: [],
      error: null,
      discoveryTime: Date.now(),
    };

    try {
      if (this.options.paginationMode === 'auto') {
        // Try range-based discovery first
        const rangeResult = await this.discoverRangePagination(baseUrl, fetchClient);

        if (rangeResult.success && rangeResult.validUrls.length > 0) {
          Object.assign(result, rangeResult);
          result.mode = 'range';
        } else {
          // Fall back to letter-based discovery
          this.logger.info({ baseUrl }, 'Range pagination failed, trying letter-based discovery');
          const letterResult = await this.discoverLetterPagination(baseUrl, fetchClient);
          Object.assign(result, letterResult);
          result.mode = 'letters';
        }
      } else if (this.options.paginationMode === 'range') {
        const rangeResult = await this.discoverRangePagination(baseUrl, fetchClient);
        Object.assign(result, rangeResult);
      } else if (this.options.paginationMode === 'letters') {
        const letterResult = await this.discoverLetterPagination(baseUrl, fetchClient);
        Object.assign(result, letterResult);
      }

      // Cache successful results
      if (result.success) {
        this.discoveryCache.set(cacheKey, {
          result: { ...result },
          timestamp: Date.now(),
        });
      }

      this.logger.info(
        {
          baseUrl,
          mode: result.mode,
          success: result.success,
          validUrls: result.validUrls.length,
          totalPages: result.totalPages,
        },
        'Pagination discovery completed'
      );

      return result;
    } catch (error) {
      result.error = error.message;
      this.logger.error({ baseUrl, error: error.message }, 'Pagination discovery failed');
      return result;
    }
  }

  /**
   * Discover range-based pagination (e.g., /page/1, /page/2, ...)
   * @param {string} baseUrl - Base URL to analyze
   * @param {object} fetchClient - HTTP client
   * @returns {Promise<object>} Discovery result
   */
  async discoverRangePagination(baseUrl, fetchClient) {
    const result = {
      success: false,
      validUrls: [],
      totalPages: null,
      error: null,
    };

    try {
      // First, try to fetch the base URL to get pagination info
      let startUrl = baseUrl;

      // If URL doesn't end with page number, try page/1
      const urlPattern = this.extractUrlPattern(baseUrl);
      if (!urlPattern.includes('/page/')) {
        startUrl = baseUrl.replace(/\/?$/, '/page/1');
      }

      this.logger.debug({ startUrl }, 'Fetching first page for pagination analysis');

      const response = await fetchClient(startUrl, {
        method: 'GET',
        timeout: 10000,
      });

      if (!response.ok) {
        result.error = `First page returned ${response.status}`;
        return result;
      }

      const html = await response.text();
      const paginationInfo = this.extractPaginationFromHtml(html, startUrl);

      result.validUrls.push(startUrl);

      // If we found total pages, generate all URLs
      if (paginationInfo.totalPages && paginationInfo.totalPages > 1) {
        result.totalPages = paginationInfo.totalPages;

        const basePattern = startUrl.replace(/\/page\/\d+/, '/page/');
        for (
          let page = 2;
          page <= Math.min(paginationInfo.totalPages, this.options.maxPagesToDiscover);
          page++
        ) {
          result.validUrls.push(`${basePattern}${page}`);
        }

        result.success = true;
        this.logger.info(
          {
            totalPages: result.totalPages,
            generatedUrls: result.validUrls.length,
          },
          'Generated URLs from total pages'
        );

        return result;
      }

      // Otherwise, probe incrementally until we hit consecutive 404s
      let currentPage = 2;
      let consecutive404s = 0;
      const basePattern = startUrl.replace(/\/page\/\d+/, '/page/');

      while (
        consecutive404s < this.options.maxConsecutive404s &&
        result.validUrls.length < this.options.maxPagesToDiscover
      ) {
        const pageUrl = `${basePattern}${currentPage}`;

        try {
          const pageResponse = await fetchClient(pageUrl, {
            method: 'HEAD',
            timeout: 5000,
          });

          if (pageResponse.ok) {
            result.validUrls.push(pageUrl);
            consecutive404s = 0; // Reset counter
            this.logger.debug({ pageUrl, status: pageResponse.status }, 'Found valid page');
          } else if (pageResponse.status === 404) {
            consecutive404s++;
            this.logger.debug({ pageUrl, consecutive404s }, 'Page returned 404');
          } else {
            // Non-404 error, treat as potential valid page
            result.validUrls.push(pageUrl);
            consecutive404s = 0;
            this.logger.debug(
              { pageUrl, status: pageResponse.status },
              'Found page with non-200 status'
            );
          }
        } catch (error) {
          consecutive404s++;
          this.logger.debug(
            { pageUrl, error: error.message, consecutive404s },
            'Page request failed'
          );
        }

        currentPage++;

        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (result.validUrls.length > 1) {
        result.success = true;
        result.totalPages = result.validUrls.length;
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Discover letter-based pagination (e.g., /filter/a/page/1, /filter/b/page/1)
   * @param {string} baseUrl - Base URL to analyze
   * @param {object} fetchClient - HTTP client
   * @returns {Promise<object>} Discovery result
   */
  async discoverLetterPagination(baseUrl, fetchClient) {
    const result = {
      success: false,
      validUrls: [],
      letterIndexes: [],
      error: null,
    };

    try {
      // Extract the pattern and replace 'all' with letter placeholders
      let basePattern = baseUrl;

      // Common patterns to replace
      if (basePattern.includes('/filter/all/')) {
        basePattern = basePattern.replace('/filter/all/', '/filter/{letter}/');
      } else if (basePattern.includes('/all/')) {
        basePattern = basePattern.replace('/all/', '/{letter}/');
      } else {
        result.error = 'Could not identify letter substitution pattern';
        return result;
      }

      this.logger.debug({ basePattern }, 'Trying letter-based pagination');

      // Test each letter index
      for (const letter of this.options.letterIndexes) {
        const letterUrl = basePattern.replace('{letter}', letter);

        try {
          const response = await fetchClient(letterUrl, {
            method: 'HEAD',
            timeout: 5000,
          });

          if (response.ok) {
            result.validUrls.push(letterUrl);
            result.letterIndexes.push(letter);

            this.logger.debug({ letter, letterUrl }, 'Found valid letter index');

            // For each valid letter, try to discover its pagination
            if (letterUrl.includes('/page/')) {
              const letterPages = await this.discoverLetterPages(letterUrl, fetchClient);
              result.validUrls.push(...letterPages);
            }
          }
        } catch (error) {
          this.logger.debug({ letter, error: error.message }, 'Letter index failed');
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 150));

        // Limit discovery to prevent excessive requests
        if (result.letterIndexes.length >= 10) {
          this.logger.info(
            { foundLetters: result.letterIndexes.length },
            'Limiting letter discovery'
          );
          break;
        }
      }

      if (result.letterIndexes.length > 0) {
        result.success = true;
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Discover additional pages for a letter index
   * @param {string} letterUrl - Base letter URL (e.g., /filter/a/page/1)
   * @param {object} fetchClient - HTTP client
   * @returns {Promise<Array<string>>} Additional page URLs
   */
  async discoverLetterPages(letterUrl, fetchClient) {
    const additionalPages = [];

    try {
      // Extract base pattern for this letter
      const basePattern = letterUrl.replace(/\/page\/\d+/, '/page/');
      let currentPage = 2;
      let consecutive404s = 0;

      // Probe a few additional pages for each letter (limited to avoid spam)
      while (consecutive404s < 2 && additionalPages.length < 5) {
        const pageUrl = `${basePattern}${currentPage}`;

        try {
          const response = await fetchClient(pageUrl, {
            method: 'HEAD',
            timeout: 3000,
          });

          if (response.ok) {
            additionalPages.push(pageUrl);
            consecutive404s = 0;
          } else if (response.status === 404) {
            consecutive404s++;
          }
        } catch (error) {
          consecutive404s++;
        }

        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      this.logger.debug({ letterUrl, error: error.message }, 'Failed to discover letter pages');
    }

    return additionalPages;
  }

  /**
   * Extract URL pattern for caching
   * @param {string} url - URL to extract pattern from
   * @returns {string} URL pattern
   */
  extractUrlPattern(url) {
    try {
      const parsed = new URL(url);
      // Remove page numbers for pattern matching
      return parsed.origin + parsed.pathname.replace(/\/page\/\d+/, '/page/*') + parsed.search;
    } catch (error) {
      return url;
    }
  }

  /**
   * Get discovery statistics
   * @returns {object} Stats
   */
  getStats() {
    return {
      cacheSize: this.discoveryCache.size,
      cacheMaxAge: this.cacheMaxAge,
    };
  }

  /**
   * Clear discovery cache
   */
  clearCache() {
    this.discoveryCache.clear();
    this.logger.debug('Cleared pagination discovery cache');
  }
}

module.exports = { PaginationDiscovery };
