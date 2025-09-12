/**
 * URL Normalization Pipeline Middleware
 * 
 * Implements the canonicalization algorithm from README:
 * - HTTP → HTTPS upgrade
 * - www/apex domain variants
 * - Trailing slash normalization
 * - Redirect chain tracking
 */

import { URL } from 'url';
import { UrlCanonicalizer } from '../lib/http/url-canonicalizer';
import { PaginationDiscovery } from '../lib/pagination-discovery';
import { createLogger } from '../lib/logger';

export interface NormalizationResult {
  originalUrl: string;
  resolvedUrl: string;
  redirectChain: Array<{
    from: string;
    to: string;
    status: number;
  }>;
  canonicalized: boolean;
  paginationDiscovered: boolean;
  discoveredUrls?: string[];
  error?: string;
}

export interface NormalizationOptions {
  enableCanonicalization?: boolean;
  enablePaginationDiscovery?: boolean;
  maxVariants?: number;
  preflightTimeout?: number;
  maxConsecutive404s?: number;
  maxPagesToDiscover?: number;
}

export class UrlNormalizer {
  private canonicalizer: UrlCanonicalizer;
  private paginationDiscovery: PaginationDiscovery;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: NormalizationOptions = {}) {
    this.logger = createLogger('url-normalizer');
    
    this.canonicalizer = new UrlCanonicalizer({
      maxVariants: options.maxVariants || 4,
      preflightTimeout: options.preflightTimeout || 5000,
    });

    this.paginationDiscovery = new PaginationDiscovery({
      maxConsecutive404s: options.maxConsecutive404s || 3,
      maxPagesToDiscover: options.maxPagesToDiscover || 100,
    });
  }

  /**
   * Normalize a single URL with optional pagination discovery
   */
  async normalizeUrl(
    url: string, 
    fetchClient: (url: string, options?: any) => Promise<Response>,
    options: NormalizationOptions = {}
  ): Promise<NormalizationResult> {
    const result: NormalizationResult = {
      originalUrl: url,
      resolvedUrl: url,
      redirectChain: [],
      canonicalized: false,
      paginationDiscovered: false,
    };

    try {
      this.logger.info({ url }, 'Starting URL normalization');

      // Step 1: Try canonicalization if enabled
      if (options.enableCanonicalization !== false) {
        try {
          const canonicalResult = await this.canonicalizer.canonicalizeUrl(url, fetchClient);
          
          if (canonicalResult.success && canonicalResult.canonicalUrl) {
            result.resolvedUrl = canonicalResult.canonicalUrl;
            result.redirectChain = canonicalResult.redirectChain || [];
            result.canonicalized = true;
            
            this.logger.info({ 
              originalUrl: url, 
              resolvedUrl: result.resolvedUrl,
              redirects: result.redirectChain.length 
            }, 'URL canonicalized successfully');
          } else {
            this.logger.warn({ url, error: canonicalResult.error }, 'URL canonicalization failed');
          }
        } catch (error) {
          this.logger.warn({ url, error: error instanceof Error ? error.message : 'Unknown error' }, 'URL canonicalization error');
        }
      }

      // Step 2: Try pagination discovery if enabled
      if (options.enablePaginationDiscovery !== false) {
        try {
          const discoveryResult = await this.paginationDiscovery.discoverPagination(
            result.resolvedUrl, 
            fetchClient
          );
          
          if (discoveryResult.success && discoveryResult.validUrls.length > 0) {
            result.paginationDiscovered = true;
            result.discoveredUrls = discoveryResult.validUrls;
            
            this.logger.info({ 
              baseUrl: result.resolvedUrl,
              discoveredUrls: discoveryResult.validUrls.length,
              mode: discoveryResult.mode
            }, 'Pagination discovery successful');
          } else {
            this.logger.debug({ url: result.resolvedUrl, error: discoveryResult.error }, 'Pagination discovery failed');
          }
        } catch (error) {
          this.logger.warn({ url: result.resolvedUrl, error: error instanceof Error ? error.message : 'Unknown error' }, 'Pagination discovery error');
        }
      }

      this.logger.info({ 
        originalUrl: url,
        resolvedUrl: result.resolvedUrl,
        canonicalized: result.canonicalized,
        paginationDiscovered: result.paginationDiscovered,
        discoveredUrls: result.discoveredUrls?.length || 0
      }, 'URL normalization completed');

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ url, error: result.error }, 'URL normalization failed');
      return result;
    }
  }

  /**
   * Normalize multiple URLs in batch
   */
  async normalizeUrls(
    urls: string[],
    fetchClient: (url: string, options?: any) => Promise<Response>,
    options: NormalizationOptions = {}
  ): Promise<NormalizationResult[]> {
    this.logger.info({ urlCount: urls.length }, 'Starting batch URL normalization');

    const results: NormalizationResult[] = [];
    
    for (const url of urls) {
      try {
        const result = await this.normalizeUrl(url, fetchClient, options);
        results.push(result);
      } catch (error) {
        results.push({
          originalUrl: url,
          resolvedUrl: url,
          redirectChain: [],
          canonicalized: false,
          paginationDiscovered: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.info({ 
      totalUrls: urls.length,
      canonicalized: results.filter(r => r.canonicalized).length,
      paginationDiscovered: results.filter(r => r.paginationDiscovered).length,
      errors: results.filter(r => r.error).length
    }, 'Batch URL normalization completed');

    return results;
  }

  /**
   * Get normalization statistics
   */
  getStats() {
    return {
      canonicalizer: this.canonicalizer.getStats(),
      paginationDiscovery: this.paginationDiscovery.getStats(),
    };
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.canonicalizer.clearCache();
    this.paginationDiscovery.clearCache();
    this.logger.info('Cleared normalization caches');
  }
}