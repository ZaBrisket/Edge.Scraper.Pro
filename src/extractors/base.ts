/**
 * Base Extractor Interface and Utilities
 * 
 * Provides common interfaces and safe HTML parsing utilities
 * for all extractor plugins (News, Sports, Companies)
 */

import { JSDOM } from 'jsdom';
import { createLogger } from '../lib/logger';

export interface ExtractionResult {
  success: boolean;
  data: any;
  error?: string;
  extractor: string;
  contentLength: number;
  fallbackUsed?: string;
}

export interface BaseExtractorOptions {
  enableFallbacks?: boolean;
  minContentLength?: number;
  maxContentLength?: number;
  enableLogging?: boolean;
}

export abstract class BaseExtractor {
  protected logger: ReturnType<typeof createLogger>;
  protected options: Required<BaseExtractorOptions>;

  constructor(options: BaseExtractorOptions = {}) {
    this.options = {
      enableFallbacks: options.enableFallbacks !== false,
      minContentLength: options.minContentLength || 500,
      maxContentLength: options.maxContentLength || 1000000,
      enableLogging: options.enableLogging !== false,
    };
    
    this.logger = createLogger(this.constructor.name);
  }

  /**
   * Main extraction method - must be implemented by subclasses
   */
  abstract extract(document: Document, url: string): Promise<ExtractionResult>;

  /**
   * Safe HTML parsing with error handling
   */
  protected parseHtml(html: string, url: string): Document | null {
    try {
      const dom = new JSDOM(html, { url });
      return dom.window.document;
    } catch (error) {
      this.logger.error({ 
        url, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to parse HTML');
      return null;
    }
  }

  /**
   * Safe text extraction with fallbacks
   */
  protected extractTextWithFallbacks(document: Document, url: string): string {
    const fallbacks = [
      // Primary selectors (to be defined by subclasses)
      () => this.extractPrimaryContent(document),
      
      // Semantic/readability fallback
      () => this.extractSemanticContent(document),
      
      // Raw body fallback
      () => this.extractRawBody(document),
    ];

    for (let i = 0; i < fallbacks.length; i++) {
      try {
        const content = fallbacks[i]();
        if (content && content.length >= this.options.minContentLength) {
          this.logger.debug({ 
            url, 
            fallback: i === 0 ? 'primary' : i === 1 ? 'semantic' : 'raw',
            length: content.length 
          }, 'Content extracted successfully');
          return content;
        }
      } catch (error) {
        this.logger.warn({ 
          url, 
          fallback: i === 0 ? 'primary' : i === 1 ? 'semantic' : 'raw',
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, 'Fallback extraction failed');
      }
    }

    this.logger.error({ url }, 'All content extraction fallbacks failed');
    return '';
  }

  /**
   * Primary content extraction - must be implemented by subclasses
   */
  protected abstract extractPrimaryContent(document: Document): string;

  /**
   * Semantic content extraction using readability-like approach
   */
  protected extractSemanticContent(document: Document): string {
    try {
      // Remove script and style elements
      const elementsToRemove = document.querySelectorAll('script, style, nav, header, footer, aside');
      elementsToRemove.forEach(el => el.remove());

      // Look for main content areas
      const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '#content',
        '#main',
      ];

      for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim() || '';
          if (text.length >= this.options.minContentLength) {
            return text;
          }
        }
      }

      // Fall back to body content
      return document.body?.textContent?.trim() || '';
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Semantic extraction failed');
      return '';
    }
  }

  /**
   * Raw body content extraction
   */
  protected extractRawBody(document: Document): string {
    try {
      // Remove script and style elements
      const elementsToRemove = document.querySelectorAll('script, style');
      elementsToRemove.forEach(el => el.remove());

      return document.body?.textContent?.trim() || '';
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Raw body extraction failed');
      return '';
    }
  }

  /**
   * Extract metadata from document
   */
  protected extractMetadata(document: Document): Record<string, string> {
    const metadata: Record<string, string> = {};

    try {
      // Title
      const title = document.querySelector('title')?.textContent?.trim();
      if (title) metadata.title = title;

      // Meta description
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
      if (description) metadata.description = description;

      // Meta keywords
      const keywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content');
      if (keywords) metadata.keywords = keywords;

      // Open Graph tags
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogTitle) metadata.ogTitle = ogTitle;

      const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      if (ogDescription) metadata.ogDescription = ogDescription;

      // Canonical URL
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      if (canonical) metadata.canonical = canonical;

    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Metadata extraction failed');
    }

    return metadata;
  }

  /**
   * Validate extraction result
   */
  protected validateResult(result: Partial<ExtractionResult>, url: string): ExtractionResult {
    const contentLength = result.data?.content?.length || 0;
    
    if (contentLength < this.options.minContentLength) {
      this.logger.error({ 
        url, 
        contentLength, 
        minRequired: this.options.minContentLength 
      }, 'Content too short - zero-character regression detected');
      
      return {
        success: false,
        data: result.data || {},
        error: `Content too short: ${contentLength} chars (minimum: ${this.options.minContentLength})`,
        extractor: this.constructor.name,
        contentLength,
        fallbackUsed: result.fallbackUsed,
      };
    }

    if (contentLength > this.options.maxContentLength) {
      this.logger.warn({ 
        url, 
        contentLength, 
        maxAllowed: this.options.maxContentLength 
      }, 'Content too long - truncating');
    }

    return {
      success: true,
      data: result.data || {},
      extractor: this.constructor.name,
      contentLength,
      fallbackUsed: result.fallbackUsed,
    };
  }

  /**
   * Get extractor statistics
   */
  getStats() {
    return {
      extractor: this.constructor.name,
      options: this.options,
    };
  }
}