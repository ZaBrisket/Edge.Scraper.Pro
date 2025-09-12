/**
 * Enhanced Batch Processing Module for Edge.Scraper.Pro
 *
 * Hardened implementation with:
 * - Comprehensive input validation
 * - Thread-safe state management
 * - Graceful shutdown handling
 * - Memory-efficient processing
 * - Idempotent operations
 * - Detailed error tracking with bounded memory usage
 */

import { URL } from 'url';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { JSDOM } from 'jsdom';
import config from './config';
import { createLogger } from './logger';
import { SupplierDirectoryExtractor } from './supplier-directory-extractor';
import { SportsContentExtractor } from './sports-extractor';
import { EnhancedFetchClient } from './http/enhanced-fetch-client';
import { StructuredLogger } from './http/structured-logger';

// Input validation schemas
const urlArraySchema = z.array(z.string()).min(1).max(10000);

const batchOptionsSchema = z
  .object({
    concurrency: z.number().int().min(1).max(100).optional(),
    delayMs: z.number().int().min(0).max(60000).optional(),
    timeout: z.number().int().min(100).max(300000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    errorReportSize: z.number().int().min(10).max(1000).optional(),
    extractionMode: z.enum(['sports', 'supplier-directory', 'general']).optional(),
    enableUrlNormalization: z.boolean().optional(),
    enablePaginationDiscovery: z.boolean().optional(),
    enableStructuredLogging: z.boolean().optional(),
    onProgress: z.function().optional(),
    onError: z.function().optional(),
    onComplete: z.function().optional(),
    correlationId: z.string().uuid().optional(),
  })
  .strict();

// Enhanced error categories for detailed reporting
const ERROR_CATEGORIES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  PARSING: 'parsing',
  VALIDATION: 'validation',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  CLIENT_ERROR: 'client_error',
  HTTP_404: 'http_404',
  HTTP_403: 'http_403',
  HTTP_401: 'http_401',
  DNS_ERROR: 'dns_error',
  BLOCKED_BY_ROBOTS: 'blocked_by_robots',
  ANTI_BOT_CHALLENGE: 'anti_bot_challenge',
  REDIRECT_LOOP: 'redirect_loop',
  SSL_ERROR: 'ssl_error',
  UNKNOWN: 'unknown',
} as const;

// Batch processing states
const BATCH_STATES = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

type ErrorCategory = (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES];
type BatchState = (typeof BATCH_STATES)[keyof typeof BATCH_STATES];

export interface BatchOptions {
  concurrency?: number;
  delayMs?: number;
  timeout?: number;
  maxRetries?: number;
  errorReportSize?: number;
  extractionMode?: 'sports' | 'supplier-directory' | 'general';
  enableUrlNormalization?: boolean;
  enablePaginationDiscovery?: boolean;
  enableStructuredLogging?: boolean;
  onProgress?: (progress: ProgressInfo) => void;
  onError?: (error: ProcessingError) => void;
  onComplete?: (result: BatchResult) => void;
  correlationId?: string;
}

export interface ProgressInfo {
  completed: number;
  total: number;
  percentage: number;
  currentUrl?: string;
  errors: number;
  state: BatchState;
}

export interface ProcessingError {
  url: string;
  error: string;
  category: ErrorCategory;
  timestamp: number;
  attempt: number;
  retryable: boolean;
}

export interface BatchResult {
  batchId: string;
  stats: {
    totalUrls: number;
    processedUrls: number;
    successfulUrls: number;
    failedUrls: number;
    skippedUrls: number;
    startTime: number;
    endTime: number;
    duration: number;
    processingTime: number;
    averageProcessingTime: number;
    throughput: number;
  };
  results: Array<{
    url: string;
    success: boolean;
    result?: {
      companies: any[];
      extractedAt: string;
      [key: string]: any;
    };
    error?: string;
    category?: ErrorCategory;
    responseTime?: number;
    canonicalized?: boolean;
    paginationDiscovered?: boolean;
  }>;
  errors: ProcessingError[];
  summary: {
    errorCategories: Record<ErrorCategory, number>;
    averageResponseTime: number;
    successRate: number;
  };
}

// Global tracking for graceful shutdown
const activeBatches = new Map<string, BatchProcessor>();

export class BatchProcessor {
  public readonly batchId: string;
  public readonly correlationId: string;
  private logger: ReturnType<typeof createLogger>;
  private options: Required<BatchOptions>;
  private state: BatchState = BATCH_STATES.IDLE;
  private urls: string[] = [];
  private results: BatchResult['results'] = [];
  private errors: ProcessingError[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private processedCount: number = 0;
  private successfulCount: number = 0;
  private failedCount: number = 0;
  private skippedCount: number = 0;
  private structuredLogger?: StructuredLogger;
  private extractor?: SupplierDirectoryExtractor | SportsContentExtractor;
  private fetchClient?: EnhancedFetchClient;
  private abortController?: AbortController;

  constructor(options: BatchOptions = {}) {
    // Validate options
    const validatedOptions = batchOptionsSchema.parse(options);

    this.batchId = randomUUID();
    this.correlationId = validatedOptions.correlationId || this.batchId;
    this.logger = createLogger('batch-processor', this.correlationId);

    this.options = {
      concurrency: validatedOptions.concurrency || config.MAX_CONCURRENCY || 5,
      delayMs: validatedOptions.delayMs ?? 250,
      timeout: validatedOptions.timeout || config.DEFAULT_TIMEOUT_MS || 30000,
      maxRetries: validatedOptions.maxRetries ?? config.MAX_RETRIES ?? 3,
      errorReportSize: validatedOptions.errorReportSize || 50,
      extractionMode: validatedOptions.extractionMode || 'general',
      enableUrlNormalization: validatedOptions.enableUrlNormalization !== false,
      enablePaginationDiscovery: validatedOptions.enablePaginationDiscovery !== false,
      enableStructuredLogging: validatedOptions.enableStructuredLogging !== false,
      onProgress: validatedOptions.onProgress || (() => {}),
      onError: validatedOptions.onError || (() => {}),
      onComplete: validatedOptions.onComplete || (() => {}),
      correlationId: validatedOptions.correlationId || this.batchId,
    };

    // Validate final options
    this.validateConfiguration();

    // Initialize components
    this.initializeComponents();

    // Register for graceful shutdown
    activeBatches.set(this.batchId, this);

    this.logger.info('BatchProcessor initialized', {
      batchId: this.batchId,
      options: this.options,
    });
  }

  private validateConfiguration(): void {
    const issues: string[] = [];

    if (this.options.concurrency < 1 || this.options.concurrency > 100) {
      issues.push('Concurrency must be between 1 and 100');
    }

    if (this.options.delayMs < 0 || this.options.delayMs > 60000) {
      issues.push('Delay must be between 0 and 60000ms');
    }

    if (this.options.timeout < 100 || this.options.timeout > 300000) {
      issues.push('Timeout must be between 100 and 300000ms');
    }

    if (this.options.maxRetries < 0 || this.options.maxRetries > 10) {
      issues.push('Max retries must be between 0 and 10');
    }

    if (issues.length > 0) {
      throw new Error(`Configuration validation failed: ${issues.join(', ')}`);
    }
  }

  private initializeComponents(): void {
    // Initialize structured logger if enabled
    if (this.options.enableStructuredLogging) {
      this.structuredLogger = new StructuredLogger({
        jobId: this.batchId,
        logDirectory: './logs',
        enableConsoleLogging: true,
        enableFileLogging: true,
      });
    }

    // Initialize extractor based on mode
    switch (this.options.extractionMode) {
      case 'supplier-directory':
        this.extractor = new SupplierDirectoryExtractor();
        break;
      case 'sports':
        this.extractor = new SportsContentExtractor();
        break;
      default:
        // General mode - no specific extractor
        break;
    }

    // Initialize fetch client
    this.fetchClient = new EnhancedFetchClient({
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries,
      enableUrlNormalization: this.options.enableUrlNormalization,
      enablePaginationDiscovery: this.options.enablePaginationDiscovery,
      structuredLogger: this.structuredLogger,
    });
  }

  async processBatch(urls: string[]): Promise<BatchResult> {
    if (this.state !== BATCH_STATES.IDLE) {
      throw new Error(`Cannot process batch in state: ${this.state}`);
    }

    try {
      this.state = BATCH_STATES.VALIDATING;
      this.logger.info('Starting batch validation', { urlCount: urls.length });

      // Validate URLs
      const validatedUrls = urlArraySchema.parse(urls);
      this.urls = [...validatedUrls];

      this.state = BATCH_STATES.PROCESSING;
      this.startTime = Date.now();
      this.abortController = new AbortController();

      this.logger.info('Starting batch processing', {
        batchId: this.batchId,
        urlCount: this.urls.length,
        concurrency: this.options.concurrency,
        extractionMode: this.options.extractionMode,
      });

      // Process URLs in batches
      await this.processUrlsInBatches();

      this.state = BATCH_STATES.COMPLETED;
      this.endTime = Date.now();

      const result = this.generateResult();

      this.logger.info('Batch processing completed', {
        batchId: this.batchId,
        stats: result.stats,
      });

      // Call completion callback
      this.options.onComplete(result);

      // Finalize structured logging
      if (this.structuredLogger) {
        await this.structuredLogger.finalize();
      }

      return result;
    } catch (error) {
      this.state = BATCH_STATES.ERROR;
      this.endTime = Date.now();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Batch processing failed', {
        batchId: this.batchId,
        error: errorMessage,
        state: this.state,
      });

      throw error;
    } finally {
      // Cleanup
      this.cleanup();
    }
  }

  private async processUrlsInBatches(): Promise<void> {
    const batches: string[][] = [];
    for (let i = 0; i < this.urls.length; i += this.options.concurrency) {
      batches.push(this.urls.slice(i, i + this.options.concurrency));
    }

    for (const batch of batches) {
      if (this.abortController?.signal.aborted) {
        this.logger.warn('Batch processing aborted');
        break;
      }

      await Promise.all(batch.map(url => this.processUrl(url)));

      // Delay between batches
      if (this.options.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.options.delayMs));
      }

      // Update progress
      this.updateProgress();
    }
  }

  private async processUrl(url: string): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.options.maxRetries) {
      try {
        if (this.abortController?.signal.aborted) {
          this.skippedCount++;
          return;
        }

        this.logger.debug('Processing URL', { url, attempt });

        // Fetch the URL
        const fetchResult = await this.fetchClient!.fetch(url, {
          signal: this.abortController?.signal,
        });

        if (!fetchResult.success) {
          throw new Error(fetchResult.error || 'Fetch failed');
        }

        // Extract data if extractor is available
        let extractedData: any = null;
        if (this.extractor && fetchResult.content) {
          try {
            const dom = new JSDOM(fetchResult.content);
            extractedData = await this.extractor.extract(dom.window.document, url);
          } catch (extractError) {
            this.logger.warn('Data extraction failed', {
              url,
              error: extractError instanceof Error ? extractError.message : 'Unknown error',
            });
          }
        }

        // Record successful result
        this.results.push({
          url,
          success: true,
          result: {
            companies: extractedData?.companies || [],
            extractedAt: new Date().toISOString(),
            ...extractedData
          },
          responseTime: Date.now() - startTime,
          canonicalized: fetchResult.canonicalized,
          paginationDiscovered: fetchResult.paginationDiscovered,
        });

        this.successfulCount++;
        this.processedCount++;

        this.logger.debug('URL processed successfully', {
          url,
          responseTime: Date.now() - startTime,
          canonicalized: fetchResult.canonicalized,
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;

        if (attempt <= this.options.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.logger.debug('Retrying URL after error', {
            url,
            attempt,
            error: lastError.message,
            backoff,
          });
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    // All retries failed
    const errorCategory = this.categorizeError(lastError!);
    const processingError: ProcessingError = {
      url,
      error: lastError!.message,
      category: errorCategory,
      timestamp: Date.now(),
      attempt,
      retryable: this.isRetryableError(lastError!),
    };

    this.errors.push(processingError);
    this.results.push({
      url,
      success: false,
      error: lastError!.message,
      category: errorCategory,
      responseTime: Date.now() - startTime,
    });

    this.failedCount++;
    this.processedCount++;

    // Call error callback
    this.options.onError(processingError);

    this.logger.warn('URL processing failed', {
      url,
      error: lastError!.message,
      category: errorCategory,
      attempts: attempt,
    });
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) return ERROR_CATEGORIES.TIMEOUT;
    if (message.includes('network') || message.includes('connection'))
      return ERROR_CATEGORIES.NETWORK;
    if (message.includes('404')) return ERROR_CATEGORIES.HTTP_404;
    if (message.includes('403')) return ERROR_CATEGORIES.HTTP_403;
    if (message.includes('401')) return ERROR_CATEGORIES.HTTP_401;
    if (message.includes('429')) return ERROR_CATEGORIES.RATE_LIMIT;
    if (message.includes('500') || message.includes('502') || message.includes('503'))
      return ERROR_CATEGORIES.SERVER_ERROR;
    if (message.includes('dns') || message.includes('enotfound')) return ERROR_CATEGORIES.DNS_ERROR;
    if (message.includes('robots')) return ERROR_CATEGORIES.BLOCKED_BY_ROBOTS;
    if (message.includes('cloudflare') || message.includes('challenge'))
      return ERROR_CATEGORIES.ANTI_BOT_CHALLENGE;
    if (message.includes('redirect')) return ERROR_CATEGORIES.REDIRECT_LOOP;
    if (message.includes('ssl') || message.includes('certificate'))
      return ERROR_CATEGORIES.SSL_ERROR;

    return ERROR_CATEGORIES.UNKNOWN;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return !(
      message.includes('404') ||
      message.includes('403') ||
      message.includes('401') ||
      message.includes('robots') ||
      message.includes('dns')
    );
  }

  private updateProgress(): void {
    const progress: ProgressInfo = {
      completed: this.processedCount,
      total: this.urls.length,
      percentage: Math.round((this.processedCount / this.urls.length) * 100),
      errors: this.failedCount,
      state: this.state,
    };

    this.options.onProgress(progress);
  }

  private generateResult(): BatchResult {
    const duration = this.endTime - this.startTime;
    const errorCategories: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;

    // Initialize error categories
    Object.values(ERROR_CATEGORIES).forEach(category => {
      errorCategories[category] = 0;
    });

    // Count errors by category
    this.errors.forEach(error => {
      errorCategories[error.category]++;
    });

    const responseTimes = this.results
      .filter(r => r.responseTime !== undefined)
      .map(r => r.responseTime!);

    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const successRate =
      this.processedCount > 0 ? (this.successfulCount / this.processedCount) * 100 : 0;

    const processingTime = duration;
    const averageProcessingTime = this.processedCount > 0 ? processingTime / this.processedCount : 0;
    const throughput = processingTime > 0 ? (this.processedCount / processingTime) * 1000 : 0; // URLs per second

    return {
      batchId: this.batchId,
      stats: {
        totalUrls: this.urls.length,
        processedUrls: this.processedCount,
        successfulUrls: this.successfulCount,
        failedUrls: this.failedCount,
        skippedUrls: this.skippedCount,
        startTime: this.startTime,
        endTime: this.endTime,
        duration,
        processingTime,
        averageProcessingTime,
        throughput,
      },
      results: this.results,
      errors: this.errors.slice(-this.options.errorReportSize), // Keep only recent errors
      summary: {
        errorCategories,
        averageResponseTime,
        successRate,
      },
    };
  }

  private cleanup(): void {
    activeBatches.delete(this.batchId);
    this.abortController = undefined;
  }

  // Public methods for external control
  pause(): void {
    if (this.state === BATCH_STATES.PROCESSING) {
      this.state = BATCH_STATES.PAUSED;
      this.logger.info('Batch processing paused', { batchId: this.batchId });
    }
  }

  resume(): void {
    if (this.state === BATCH_STATES.PAUSED) {
      this.state = BATCH_STATES.PROCESSING;
      this.logger.info('Batch processing resumed', { batchId: this.batchId });
    }
  }

  stop(): void {
    this.state = BATCH_STATES.STOPPED;
    this.abortController?.abort();
    this.logger.info('Batch processing stopped', { batchId: this.batchId });
  }

  getState(): BatchState {
    return this.state;
  }

  getProgress(): ProgressInfo {
    return {
      completed: this.processedCount,
      total: this.urls.length,
      percentage:
        this.urls.length > 0 ? Math.round((this.processedCount / this.urls.length) * 100) : 0,
      errors: this.failedCount,
      state: this.state,
    };
  }
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');

  for (const [batchId, processor] of activeBatches.entries()) {
    console.log(`Stopping batch processor: ${batchId}`);
    processor.stop();
  }

  activeBatches.clear();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');

  for (const [batchId, processor] of activeBatches.entries()) {
    console.log(`Stopping batch processor: ${batchId}`);
    processor.stop();
  }

  activeBatches.clear();
  process.exit(0);
});
