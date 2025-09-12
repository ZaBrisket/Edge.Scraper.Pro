/**
 * News Article Extractor
 * 
 * Extracts content from news articles with generic selectors
 * and fallback readability parser
 */

import { Document } from 'jsdom';
import { BaseExtractor, ExtractionResult } from './base';

export interface NewsExtractionData {
  title: string;
  content: string;
  author?: string;
  publishedDate?: string;
  url: string;
  metadata: Record<string, string>;
  images?: string[];
  tags?: string[];
}

export class NewsExtractor extends BaseExtractor {
  private readonly articleSelectors = [
    'article',
    '.article',
    '.post',
    '.entry',
    '.content',
    '.main-content',
    '.article-content',
    '.post-content',
    '.entry-content',
    '[role="main"]',
    'main',
  ];

  private readonly titleSelectors = [
    'h1',
    '.title',
    '.headline',
    '.article-title',
    '.post-title',
    '.entry-title',
    'title',
  ];

  private readonly authorSelectors = [
    '.author',
    '.byline',
    '.article-author',
    '.post-author',
    '.entry-author',
    '[rel="author"]',
    '.by-author',
  ];

  private readonly dateSelectors = [
    'time[datetime]',
    '.date',
    '.published',
    '.article-date',
    '.post-date',
    '.entry-date',
    '.publish-date',
  ];

  private readonly imageSelectors = [
    'img[src]',
    'picture img[src]',
    '.article-image img[src]',
    '.post-image img[src]',
  ];

  private readonly tagSelectors = [
    '.tags a',
    '.tag a',
    '.categories a',
    '.category a',
    '.article-tags a',
    '.post-tags a',
  ];

  async extract(document: Document, url: string): Promise<ExtractionResult> {
    try {
      this.logger.debug({ url }, 'Starting news article extraction');

      const data: NewsExtractionData = {
        title: '',
        content: '',
        url,
        metadata: this.extractMetadata(document),
      };

      // Extract title
      data.title = this.extractTitle(document);
      if (!data.title) {
        data.title = data.metadata.title || data.metadata.ogTitle || 'Untitled';
      }

      // Extract content with fallbacks
      const content = this.extractTextWithFallbacks(document, url);
      if (!content) {
        return this.validateResult({
          success: false,
          data,
          error: 'No content extracted',
        }, url);
      }

      data.content = content;

      // Extract additional metadata
      data.author = this.extractAuthor(document);
      data.publishedDate = this.extractPublishedDate(document);
      data.images = this.extractImages(document);
      data.tags = this.extractTags(document);

      this.logger.info({ 
        url, 
        title: data.title,
        contentLength: data.content.length,
        author: data.author,
        images: data.images?.length || 0,
        tags: data.tags?.length || 0
      }, 'News article extracted successfully');

      return this.validateResult({
        success: true,
        data,
      }, url);

    } catch (error) {
      this.logger.error({ 
        url, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'News extraction failed');

      return this.validateResult({
        success: false,
        data: { title: '', content: '', url, metadata: {} },
        error: error instanceof Error ? error.message : 'Unknown error',
      }, url);
    }
  }

  protected extractPrimaryContent(document: Document): string {
    // Try article-specific selectors first
    for (const selector of this.articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() || '';
        if (text.length >= this.options.minContentLength) {
          this.logger.debug({ selector, length: text.length }, 'Found content with article selector');
          return text;
        }
      }
    }

    // Try paragraph-based extraction
    const paragraphs = document.querySelectorAll('p');
    if (paragraphs.length > 0) {
      const content = Array.from(paragraphs)
        .map(p => p.textContent?.trim())
        .filter(text => text && text.length > 50) // Filter out short paragraphs
        .join('\n\n');

      if (content.length >= this.options.minContentLength) {
        this.logger.debug({ paragraphs: paragraphs.length, length: content.length }, 'Found content with paragraph extraction');
        return content;
      }
    }

    return '';
  }

  private extractTitle(document: Document): string {
    for (const selector of this.titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim();
        if (title && title.length > 0) {
          this.logger.debug({ selector, title }, 'Found title');
          return title;
        }
      }
    }
    return '';
  }

  private extractAuthor(document: Document): string {
    for (const selector of this.authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const author = element.textContent?.trim();
        if (author && author.length > 0) {
          this.logger.debug({ selector, author }, 'Found author');
          return author;
        }
      }
    }
    return '';
  }

  private extractPublishedDate(document: Document): string {
    for (const selector of this.dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const date = element.getAttribute('datetime') || element.textContent?.trim();
        if (date && date.length > 0) {
          this.logger.debug({ selector, date }, 'Found published date');
          return date;
        }
      }
    }
    return '';
  }

  private extractImages(document: Document): string[] {
    const images: string[] = [];
    
    for (const selector of this.imageSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const img of elements) {
        const src = img.getAttribute('src');
        if (src) {
          // Convert relative URLs to absolute
          try {
            const absoluteUrl = new URL(src, document.URL).toString();
            images.push(absoluteUrl);
          } catch (error) {
            // Skip invalid URLs
            continue;
          }
        }
      }
    }

    // Remove duplicates
    return [...new Set(images)];
  }

  private extractTags(document: Document): string[] {
    const tags: string[] = [];
    
    for (const selector of this.tagSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const tag of elements) {
        const text = tag.textContent?.trim();
        if (text && text.length > 0) {
          tags.push(text);
        }
      }
    }

    // Remove duplicates and limit to reasonable number
    return [...new Set(tags)].slice(0, 20);
  }
}