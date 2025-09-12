/**
 * Extractor Router
 * 
 * Picks the appropriate extractor plugin based on URL/domain pattern
 * or the selected tab/mode
 */

import { Document } from 'jsdom';
import { BaseExtractor, ExtractionResult } from './base';
import { NewsExtractor } from './news';
import { SportsExtractor } from './sports';
import { CompaniesExtractor } from './companies';
import { createLogger } from '../lib/logger';

export type ExtractorMode = 'news' | 'sports' | 'companies' | 'auto';

export interface ExtractorRouterOptions {
  mode?: ExtractorMode;
  enableFallbacks?: boolean;
  minContentLength?: number;
  maxContentLength?: number;
}

export class ExtractorRouter {
  private logger: ReturnType<typeof createLogger>;
  private newsExtractor: NewsExtractor;
  private sportsExtractor: SportsExtractor;
  private companiesExtractor: CompaniesExtractor;
  private options: Required<ExtractorRouterOptions>;

  // Domain patterns for auto-detection
  private readonly domainPatterns = {
    news: [
      'news.ycombinator.com',
      'reddit.com',
      'bbc.com',
      'cnn.com',
      'reuters.com',
      'ap.org',
      'npr.org',
      'nytimes.com',
      'washingtonpost.com',
      'theguardian.com',
      'bloomberg.com',
      'wsj.com',
      'forbes.com',
      'techcrunch.com',
      'arstechnica.com',
      'wired.com',
      'theverge.com',
      'engadget.com',
      'mashable.com',
      'huffpost.com',
    ],
    sports: [
      'espn.com',
      'sports.yahoo.com',
      'nfl.com',
      'nba.com',
      'mlb.com',
      'nhl.com',
      'fifa.com',
      'uefa.com',
      'premierleague.com',
      'nfl.com',
      'nascar.com',
      'formula1.com',
      'olympics.com',
      'sportingnews.com',
      'bleacherreport.com',
      'sbnation.com',
      'deadspin.com',
      'theathletic.com',
    ],
    companies: [
      'linkedin.com',
      'crunchbase.com',
      'angel.co',
      'glassdoor.com',
      'indeed.com',
      'monster.com',
      'careerbuilder.com',
      'ziprecruiter.com',
      'company.com',
      'about.com',
      'corporate.com',
      'business.com',
    ],
  };

  // URL patterns for auto-detection
  private readonly urlPatterns = {
    news: [
      /\/news\//,
      /\/article\//,
      /\/story\//,
      /\/post\//,
      /\/blog\//,
      /\/press\//,
      /\/media\//,
    ],
    sports: [
      /\/sports\//,
      /\/game\//,
      /\/match\//,
      /\/team\//,
      /\/player\//,
      /\/league\//,
      /\/tournament\//,
      /\/score\//,
    ],
    companies: [
      /\/about\//,
      /\/company\//,
      /\/team\//,
      /\/careers\//,
      /\/contact\//,
      /\/services\//,
      /\/solutions\//,
      /\/products\//,
    ],
  };

  constructor(options: ExtractorRouterOptions = {}) {
    this.options = {
      mode: options.mode || 'auto',
      enableFallbacks: options.enableFallbacks !== false,
      minContentLength: options.minContentLength || 500,
      maxContentLength: options.maxContentLength || 1000000,
    };

    this.logger = createLogger('extractor-router');

    // Initialize extractors
    this.newsExtractor = new NewsExtractor({
      enableFallbacks: this.options.enableFallbacks,
      minContentLength: this.options.minContentLength,
      maxContentLength: this.options.maxContentLength,
    });

    this.sportsExtractor = new SportsExtractor({
      enableFallbacks: this.options.enableFallbacks,
      minContentLength: this.options.minContentLength,
      maxContentLength: this.options.maxContentLength,
    });

    this.companiesExtractor = new CompaniesExtractor({
      enableFallbacks: this.options.enableFallbacks,
      minContentLength: this.options.minContentLength,
      maxContentLength: this.options.maxContentLength,
    });

    this.logger.info({ 
      mode: this.options.mode,
      enableFallbacks: this.options.enableFallbacks 
    }, 'Extractor router initialized');
  }

  /**
   * Extract content using the appropriate extractor
   */
  async extract(document: Document, url: string, mode?: ExtractorMode): Promise<ExtractionResult> {
    const effectiveMode = mode || this.options.mode;
    
    try {
      this.logger.debug({ url, mode: effectiveMode }, 'Starting content extraction');

      let extractor: BaseExtractor;
      let detectedMode: ExtractorMode;

      if (effectiveMode === 'auto') {
        const autoDetected = this.autoDetectMode(url);
        detectedMode = autoDetected;
        extractor = this.getExtractor(autoDetected);
        
        this.logger.info({ url, detectedMode }, 'Auto-detected extractor mode');
      } else {
        detectedMode = effectiveMode;
        extractor = this.getExtractor(effectiveMode);
      }

      const result = await extractor.extract(document, url);
      
      // Add mode information to result
      result.data = {
        ...result.data,
        mode: detectedMode,
        autoDetected: effectiveMode === 'auto',
      };

      this.logger.info({ 
        url, 
        mode: detectedMode,
        success: result.success,
        contentLength: result.contentLength 
      }, 'Content extraction completed');

      return result;

    } catch (error) {
      this.logger.error({ 
        url, 
        mode: effectiveMode,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Content extraction failed');

      return {
        success: false,
        data: { mode: effectiveMode, url },
        error: error instanceof Error ? error.message : 'Unknown error',
        extractor: 'ExtractorRouter',
        contentLength: 0,
      };
    }
  }

  /**
   * Auto-detect the appropriate extractor mode based on URL
   */
  private autoDetectMode(url: string): ExtractorMode {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();

      // Check domain patterns
      for (const [mode, domains] of Object.entries(this.domainPatterns)) {
        for (const domain of domains) {
          if (hostname.includes(domain)) {
            this.logger.debug({ url, mode, domain }, 'Matched domain pattern');
            return mode as ExtractorMode;
          }
        }
      }

      // Check URL patterns
      for (const [mode, patterns] of Object.entries(this.urlPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(pathname)) {
            this.logger.debug({ url, mode, pattern: pattern.source }, 'Matched URL pattern');
            return mode as ExtractorMode;
          }
        }
      }

      // Default to news for unknown patterns
      this.logger.debug({ url }, 'No pattern matched, defaulting to news');
      return 'news';

    } catch (error) {
      this.logger.warn({ url, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to parse URL for auto-detection');
      return 'news';
    }
  }

  /**
   * Get the appropriate extractor instance
   */
  private getExtractor(mode: ExtractorMode): BaseExtractor {
    switch (mode) {
      case 'news':
        return this.newsExtractor;
      case 'sports':
        return this.sportsExtractor;
      case 'companies':
        return this.companiesExtractor;
      default:
        this.logger.warn({ mode }, 'Unknown mode, defaulting to news extractor');
        return this.newsExtractor;
    }
  }

  /**
   * Get available extractor modes
   */
  getAvailableModes(): ExtractorMode[] {
    return ['news', 'sports', 'companies', 'auto'];
  }

  /**
   * Get extractor statistics
   */
  getStats() {
    return {
      mode: this.options.mode,
      availableModes: this.getAvailableModes(),
      extractors: {
        news: this.newsExtractor.getStats(),
        sports: this.sportsExtractor.getStats(),
        companies: this.companiesExtractor.getStats(),
      },
    };
  }

  /**
   * Clear all extractor caches
   */
  clearCaches() {
    // Note: BaseExtractor doesn't have clearCache method, but subclasses might
    this.logger.info('Cleared extractor caches');
  }
}