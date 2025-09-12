/**
 * Common Parsing Utilities
 * Shared parsing functions used across different tasks
 */

import { JSDOM } from 'jsdom';

export interface ParsedContent {
  title?: string;
  description?: string;
  content?: string;
  author?: string;
  publishedAt?: string;
  modifiedAt?: string;
  tags?: string[];
  images?: Array<{
    src: string;
    alt?: string;
    caption?: string;
  }>;
  metadata?: Record<string, any>;
}

export class ContentParser {
  private dom: JSDOM;
  private document: Document;

  constructor(html: string) {
    this.dom = new JSDOM(html);
    this.document = this.dom.window.document;
  }

  // Extract title from various selectors
  extractTitle(): string | undefined {
    const selectors = [
      'h1[class*="title"]',
      'h1[class*="headline"]',
      '.article-title',
      '.entry-title',
      'h1.title',
      'h1.headline',
      'article h1',
      '[property="og:title"]',
      'title',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const content = selector === '[property="og:title"]' 
          ? element.getAttribute('content') 
          : element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  // Extract description/excerpt
  extractDescription(): string | undefined {
    const selectors = [
      '[property="og:description"]',
      '[name="description"]',
      '.article-excerpt',
      '.excerpt',
      '.summary',
      '.lead',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  // Extract main content
  extractContent(maxLength: number = 5000): string | undefined {
    const selectors = [
      'article',
      '.article-content',
      '.entry-content',
      '.post-content',
      '.content',
      'main',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        // Remove script and style elements
        const scripts = element.querySelectorAll('script, style');
        scripts.forEach(script => script.remove());

        const content = element.textContent?.trim();
        if (content && content.length > 100) {
          return content.length > maxLength 
            ? content.substring(0, maxLength) + '...'
            : content;
        }
      }
    }

    return undefined;
  }

  // Extract author information
  extractAuthor(): string | undefined {
    const selectors = [
      '[rel="author"]',
      '.author',
      '.article-author',
      '[class*="author"]',
      '[property="article:author"]',
      '[name="author"]',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  // Extract publication date
  extractPublishedAt(format: 'iso' | 'timestamp' | 'human' = 'iso'): string | undefined {
    const selectors = [
      '[property="article:published_time"]',
      '[name="article:published_time"]',
      'time[datetime]',
      '.publish-date',
      '.article-date',
      '[class*="publish"]',
      '[class*="date"]',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const dateStr = element.getAttribute('content') || 
                       element.getAttribute('datetime') || 
                       element.textContent?.trim();
        
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return this.formatDate(date, format);
          }
        }
      }
    }

    return undefined;
  }

  // Extract modified date
  extractModifiedAt(format: 'iso' | 'timestamp' | 'human' = 'iso'): string | undefined {
    const selectors = [
      '[property="article:modified_time"]',
      '[name="article:modified_time"]',
      '.modified-date',
      '.updated-date',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const dateStr = element.getAttribute('content') || element.textContent?.trim();
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return this.formatDate(date, format);
          }
        }
      }
    }

    return undefined;
  }

  // Extract tags
  extractTags(): string[] {
    const tags: string[] = [];
    
    // Meta keywords
    const keywords = this.document.querySelector('[name="keywords"]');
    if (keywords) {
      const content = keywords.getAttribute('content');
      if (content) {
        tags.push(...content.split(',').map(tag => tag.trim()));
      }
    }

    // Article tags
    const tagElements = this.document.querySelectorAll('.tags a, .tag, [class*="tag"]');
    tagElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text && !tags.includes(text)) {
        tags.push(text);
      }
    });

    return tags.filter(tag => tag.length > 0).slice(0, 10); // Limit to 10 tags
  }

  // Extract images
  extractImages(baseUrl: string, maxImages: number = 5): Array<{
    src: string;
    alt?: string;
    caption?: string;
  }> {
    const images: Array<{ src: string; alt?: string; caption?: string }> = [];
    const imageElements = this.document.querySelectorAll('img');

    imageElements.forEach(img => {
      const src = img.getAttribute('src');
      if (src && images.length < maxImages) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          images.push({
            src: absoluteUrl,
            alt: img.getAttribute('alt') || undefined,
            caption: this.extractImageCaption(img),
          });
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return images;
  }

  // Extract language
  extractLanguage(): string | undefined {
    return this.document.documentElement.getAttribute('lang') || 
           this.document.querySelector('[property="og:locale"]')?.getAttribute('content') ||
           undefined;
  }

  // Extract all content in one go
  extractAll(options: {
    maxContentLength?: number;
    extractImages?: boolean;
    maxImages?: number;
    dateFormat?: 'iso' | 'timestamp' | 'human';
  } = {}): ParsedContent {
    const {
      maxContentLength = 5000,
      extractImages = false,
      maxImages = 5,
      dateFormat = 'iso',
    } = options;

    const content = this.extractContent(maxContentLength);
    const images = extractImages ? this.extractImages(window.location.href, maxImages) : undefined;

    return {
      title: this.extractTitle(),
      description: this.extractDescription(),
      content,
      author: this.extractAuthor(),
      publishedAt: this.extractPublishedAt(dateFormat),
      modifiedAt: this.extractModifiedAt(dateFormat),
      tags: this.extractTags(),
      images,
      metadata: {
        language: this.extractLanguage(),
        wordCount: content ? this.calculateWordCount(content) : undefined,
        readingTime: content ? Math.ceil(this.calculateWordCount(content) / 200) : undefined,
      },
    };
  }

  private extractImageCaption(img: Element): string | undefined {
    const parent = img.parentElement;
    if (parent) {
      const caption = parent.querySelector('figcaption, .caption');
      if (caption?.textContent?.trim()) {
        return caption.textContent.trim();
      }
    }
    return img.getAttribute('title') || undefined;
  }

  private calculateWordCount(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private formatDate(date: Date, format: string): string {
    switch (format) {
      case 'timestamp':
        return date.getTime().toString();
      case 'human':
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      default:
        return date.toISOString();
    }
  }
}

// Utility function to create content parser
export function createContentParser(html: string): ContentParser {
  return new ContentParser(html);
}