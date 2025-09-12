/**
 * News Articles Mode
 * Extracts article metadata and content from news article URLs
 */

import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { ModeContract, ModeContext, UrlListSchema, BatchOutputSchema } from './types';
import { createLogger } from '../lib/logger';
import { BatchProcessor } from '../lib/batch-processor';

// Input schema for news articles mode
const NewsArticlesInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z
    .object({
      concurrency: z.number().min(1).max(20).optional().default(5),
      delayMs: z.number().min(0).max(10000).optional().default(500),
      timeout: z.number().min(1000).max(60000).optional().default(15000),
      maxRetries: z.number().min(0).max(5).optional().default(2),
      extractContent: z.boolean().optional().default(false),
      extractImages: z.boolean().optional().default(false),
      maxContentLength: z.number().min(100).max(50000).optional().default(5000),
      dateFormat: z.enum(['iso', 'timestamp', 'human']).optional().default('iso'),
    })
    .optional()
    .default({}),
});

// Output schema for news articles results
const NewsArticlesOutputSchema = BatchOutputSchema.extend({
  results: z.array(
    z.object({
      url: z.string(),
      success: z.boolean(),
      data: z
        .object({
          title: z.string().optional(),
          byline: z.string().optional(),
          author: z.string().optional(),
          publishDate: z.string().optional(),
          modifiedDate: z.string().optional(),
          excerpt: z.string().optional(),
          content: z.string().optional(),
          wordCount: z.number().optional(),
          readingTime: z.number().optional(), // minutes
          tags: z.array(z.string()).optional(),
          category: z.string().optional(),
          images: z
            .array(
              z.object({
                src: z.string(),
                alt: z.string().optional(),
                caption: z.string().optional(),
                width: z.number().optional(),
                height: z.number().optional(),
              })
            )
            .optional(),
          metadata: z.object({
            extractedAt: z.string(),
            confidence: z.number(),
            source: z.string(),
            language: z.string().optional(),
          }),
        })
        .optional(),
      error: z.string().optional(),
      category: z.string().optional(),
      responseTime: z.number().optional(),
      canonicalized: z.boolean().optional(),
    })
  ),
});

export class NewsArticlesMode implements ModeContract {
  public readonly id = 'news-articles';
  public readonly label = 'News Articles';
  public readonly description =
    'Extract article metadata, content, and structured data from news article URLs';
  public readonly version = '1.0.0';

  public readonly inputSchema = NewsArticlesInputSchema;
  public readonly outputSchema = NewsArticlesOutputSchema;

  public readonly uiHints = {
    inputType: 'urls' as const,
    supportsBatch: true,
    supportsProgress: true,
    estimatedTimePerUrl: 1500, // 1.5 seconds per URL
    maxBatchSize: 1000,
    fileFormats: ['txt', 'csv'],
    placeholder:
      'Enter news article URLs (one per line)\nExample: https://news.example.com/article/breaking-news',
    helpText:
      'Extracts article titles, bylines, publication dates, content, and metadata from news articles.',
    examples: [
      'https://www.bbc.com/news/world-12345678',
      'https://www.cnn.com/2024/01/15/politics/news-story/index.html',
      'https://www.reuters.com/world/article-title-2024-01-15/',
    ],
  };

  private logger = createLogger('news-articles-mode');

  async run(input: z.infer<typeof NewsArticlesInputSchema>, ctx: ModeContext): Promise<any> {
    this.logger.info('Starting news articles extraction', {
      jobId: ctx.jobId,
      urlCount: input.urls.length,
      options: input.options,
    });

    try {
      // Create batch processor with general extraction mode
      const processor = new BatchProcessor({
        concurrency: input.options?.concurrency || 5,
        delayMs: input.options?.delayMs || 500,
        timeout: input.options?.timeout || 15000,
        maxRetries: input.options?.maxRetries || 2,
        extractionMode: 'general',
        enableUrlNormalization: true,
        enablePaginationDiscovery: false, // Not relevant for individual articles
        enableStructuredLogging: true,
        correlationId: ctx.correlationId,
        onProgress: progress => {
          this.logger.info('Processing progress', {
            jobId: ctx.jobId,
            completed: progress.completed,
            total: progress.total,
            percentage: progress.percentage,
            errors: progress.errors,
          });
        },
      });

      // Process the batch
      const batchResult = await processor.processBatch(input.urls);

      // Transform batch result to mode output format with article extraction
      const modeResult = {
        results: await Promise.all(
          batchResult.results.map(async result => {
            if (!result.success || !result.data) {
              return {
                url: result.url,
                success: false,
                error: result.error,
                category: result.category,
                responseTime: result.responseTime,
                canonicalized: result.canonicalized,
              };
            }

            try {
              // Extract article data from the HTML content
              const articleData = await this.extractArticleData(
                result.data.content || result.data.html || '',
                result.url,
                input.options || {}
              );

              return {
                url: result.url,
                success: true,
                data: articleData,
                responseTime: result.responseTime,
                canonicalized: result.canonicalized,
              };
            } catch (error) {
              this.logger.warn('Article extraction failed', {
                url: result.url,
                error: error instanceof Error ? error.message : 'Unknown error',
              });

              return {
                url: result.url,
                success: false,
                error: `Article extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                category: 'extraction_error',
                responseTime: result.responseTime,
                canonicalized: result.canonicalized,
              };
            }
          })
        ),
        summary: {
          total: batchResult.stats.totalUrls,
          successful: batchResult.results.filter(r => r.success).length,
          failed: batchResult.results.filter(r => !r.success).length,
          averageTime: batchResult.summary.averageResponseTime,
          errors: batchResult.errors.map(error => ({
            url: error.url,
            error: error.error,
            category: error.category,
          })),
        },
        metadata: {
          jobId: ctx.jobId,
          mode: this.id,
          startTime: new Date(batchResult.stats.startTime).toISOString(),
          endTime: new Date(batchResult.stats.endTime).toISOString(),
          duration: batchResult.stats.duration,
        },
      };

      this.logger.info('News articles extraction completed', {
        jobId: ctx.jobId,
        totalUrls: modeResult.summary.total,
        successfulUrls: modeResult.summary.successful,
        failedUrls: modeResult.summary.failed,
        duration: modeResult.metadata.duration,
      });

      return modeResult;
    } catch (error) {
      this.logger.error('News articles extraction failed', {
        jobId: ctx.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async extractArticleData(html: string, url: string, options: any): Promise<any> {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const articleData = {
      title: this.extractTitle(document),
      byline: this.extractByline(document),
      author: this.extractAuthor(document),
      publishDate: this.extractPublishDate(document, options.dateFormat),
      modifiedDate: this.extractModifiedDate(document, options.dateFormat),
      excerpt: this.extractExcerpt(document),
      content: options.extractContent
        ? this.extractContent(document, options.maxContentLength)
        : undefined,
      wordCount: undefined as number | undefined,
      readingTime: undefined as number | undefined,
      tags: this.extractTags(document),
      category: this.extractCategory(document),
      images: options.extractImages ? this.extractImages(document, url) : undefined,
      metadata: {
        extractedAt: new Date().toISOString(),
        confidence: 0,
        source: url,
        language: this.extractLanguage(document),
      },
    };

    // Calculate word count and reading time if content is available
    if (articleData.content) {
      articleData.wordCount = this.calculateWordCount(articleData.content);
      articleData.readingTime = Math.ceil(articleData.wordCount / 200); // Assume 200 WPM
    }

    // Calculate confidence score
    articleData.metadata.confidence = this.calculateConfidence(articleData);

    return articleData;
  }

  private extractTitle(document: Document): string | undefined {
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
      const element = document.querySelector(selector);
      if (element) {
        const content =
          selector === '[property="og:title"]'
            ? element.getAttribute('content')
            : element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  private extractByline(document: Document): string | undefined {
    const selectors = [
      '.byline',
      '.author-byline',
      '.article-byline',
      '[class*="byline"]',
      '.author-info',
      '.article-meta .author',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return undefined;
  }

  private extractAuthor(document: Document): string | undefined {
    const selectors = [
      '[rel="author"]',
      '.author',
      '.article-author',
      '[class*="author"]',
      '[property="article:author"]',
      '[name="author"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  private extractPublishDate(document: Document, format: string = 'iso'): string | undefined {
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
      const element = document.querySelector(selector);
      if (element) {
        const dateStr =
          element.getAttribute('content') ||
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

  private extractModifiedDate(document: Document, format: string = 'iso'): string | undefined {
    const selectors = [
      '[property="article:modified_time"]',
      '[name="article:modified_time"]',
      '.modified-date',
      '.updated-date',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
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

  private extractExcerpt(document: Document): string | undefined {
    const selectors = [
      '[property="og:description"]',
      '[name="description"]',
      '.article-excerpt',
      '.excerpt',
      '.summary',
      '.lead',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return undefined;
  }

  private extractContent(document: Document, maxLength: number = 5000): string | undefined {
    const selectors = [
      'article',
      '.article-content',
      '.entry-content',
      '.post-content',
      '.content',
      'main',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Remove script and style elements
        const scripts = element.querySelectorAll('script, style');
        scripts.forEach(script => script.remove());

        const content = element.textContent?.trim();
        if (content && content.length > 100) {
          return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
        }
      }
    }

    return undefined;
  }

  private extractTags(document: Document): string[] {
    const tags: string[] = [];

    // Meta keywords
    const keywords = document.querySelector('[name="keywords"]');
    if (keywords) {
      const content = keywords.getAttribute('content');
      if (content) {
        tags.push(...content.split(',').map(tag => tag.trim()));
      }
    }

    // Article tags
    const tagElements = document.querySelectorAll('.tags a, .tag, [class*="tag"]');
    tagElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text && !tags.includes(text)) {
        tags.push(text);
      }
    });

    return tags.filter(tag => tag.length > 0).slice(0, 10); // Limit to 10 tags
  }

  private extractCategory(document: Document): string | undefined {
    const selectors = [
      '.category',
      '.article-category',
      '[class*="category"]',
      '.breadcrumb a:last-of-type',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return undefined;
  }

  private extractImages(document: Document, baseUrl: string): Array<any> {
    const images: Array<any> = [];
    const imageElements = document.querySelectorAll(
      'article img, .article-content img, .content img'
    );

    imageElements.forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          images.push({
            src: absoluteUrl,
            alt: img.getAttribute('alt') || undefined,
            caption: this.extractImageCaption(img),
            width: img.getAttribute('width') ? parseInt(img.getAttribute('width')!) : undefined,
            height: img.getAttribute('height') ? parseInt(img.getAttribute('height')!) : undefined,
          });
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return images.slice(0, 5); // Limit to 5 images
  }

  private extractImageCaption(img: Element): string | undefined {
    // Look for caption in various places
    const parent = img.parentElement;
    if (parent) {
      const caption = parent.querySelector('figcaption, .caption');
      if (caption?.textContent?.trim()) {
        return caption.textContent.trim();
      }
    }

    return img.getAttribute('title') || undefined;
  }

  private extractLanguage(document: Document): string | undefined {
    return (
      document.documentElement.getAttribute('lang') ||
      document.querySelector('[property="og:locale"]')?.getAttribute('content') ||
      undefined
    );
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
          day: 'numeric',
        });
      default:
        return date.toISOString();
    }
  }

  private calculateConfidence(articleData: any): number {
    let confidence = 0;

    if (articleData.title) confidence += 0.3;
    if (articleData.author || articleData.byline) confidence += 0.2;
    if (articleData.publishDate) confidence += 0.2;
    if (articleData.content && articleData.content.length > 500) confidence += 0.2;
    if (articleData.excerpt) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  async validate(input: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Check for empty URL list
    if (!input.urls || input.urls.length === 0) {
      errors.push('At least one URL is required');
    }

    // Validate URL formats
    if (input.urls) {
      for (let i = 0; i < input.urls.length; i++) {
        try {
          new URL(input.urls[i]);
        } catch {
          errors.push(`Invalid URL at position ${i + 1}: ${input.urls[i]}`);
        }
      }
    }

    // Check batch size limits
    if (input.urls && input.urls.length > (this.uiHints.maxBatchSize || 1000)) {
      errors.push(`Too many URLs. Maximum allowed: ${this.uiHints.maxBatchSize}`);
    }

    // Validate options
    if (input.options) {
      if (
        input.options.maxContentLength &&
        (input.options.maxContentLength < 100 || input.options.maxContentLength > 50000)
      ) {
        errors.push('Max content length must be between 100 and 50000 characters');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
